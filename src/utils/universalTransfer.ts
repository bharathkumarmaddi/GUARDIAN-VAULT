import {
  DecryptedVaultPayload,
  DuplicateStrategy,
  EncryptedUniversalTransferFile,
  EncryptedVaultFile,
  HackathonStatus,
  ImportCandidateEntry,
  ImportExecutionReport,
  ImportPreviewAnalysis,
  ItemType,
  PortableItemType,
  PortableTransferItem,
  UniversalTransferFile,
  VaultCollection,
  VaultItem,
  VaultTag,
} from '../types/vault';
import {
  PBKDF2_ITERATIONS_V2,
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  decryptJson,
  decryptVaultFileWithPassword,
  deriveMasterKey,
  encryptBytes,
  encryptJson,
  generateSalt,
  isEncryptedVaultFileObject,
} from '../crypto/webCrypto';
import {
  detectUrlType,
  detectVisitorOS,
  normalizeUrl,
  parseBookmarksHtml,
} from './vaultLogic';

export const GVAULT_FORMAT_PRIMARY = 'guardian-vault-transfer';
export const GVAULT_FORMAT_ALT = 'guardianvault-transfer';
export const GVAULT_ENCRYPTED_FORMAT = 'guardian-vault-transfer-encrypted';
export const GVAULT_MIME_TYPE = 'application/vnd.guardianvault+json';
export const GVAULT_SCHEMA_VERSION = 1;

export const MAX_TRANSFER_FILE_BYTES = 10 * 1024 * 1024; // 10 MB DoS protection limit
export const MAX_CLIPBOARD_BYTES = 2 * 1024 * 1024; // 2 MB clipboard safety limit
export const MAX_TRANSFER_ITEM_COUNT = 10_000;
export const MAX_QR_TRANSFER_ITEMS = 10;

const CLIPBOARD_BLOCK_START = '--- BEGIN GUARDIAN VAULT TRANSFER (.gvault) ---';
const CLIPBOARD_BLOCK_END = '--- END GUARDIAN VAULT TRANSFER (.gvault) ---';
const QR_PLAIN_PREFIX = 'GVQR1:';
const QR_ENCRYPTED_PREFIX = 'GVQRE1:';

const FORBIDDEN_SECRET_KEYS = new Set([
  'pin',
  'password',
  'masterpassword',
  'masterkey',
  'dek',
  'rawdek',
  'recoverykey',
  'pinslot',
  'passwordslot',
  'recoveryslot',
  'wrappeddekcipher',
  'verifiercipher',
  'privatekey',
  'authtoken',
  'accesstoken',
  'secretkey',
]);

const VALID_HACKATHON_STATUSES = new Set<HackathonStatus>([
  'Interested',
  'Registered',
  'Building',
  'Submitted',
  'Done',
]);

/**
 * Validates that a URL uses a safe HTTP/HTTPS scheme and blocks XSS/local schemes.
 */
export function isValidTransferUrl(rawUrl?: string): boolean {
  if (!rawUrl || !rawUrl.trim()) return false;
  const trimmed = rawUrl.trim();
  if (/^(javascript|data|vbscript|file|blob|about):/i.test(trimmed)) {
    return false;
  }
  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Safe JSON parser with size limit and prototype-pollution key scrubbing.
 */
export function safeParseJson<T = unknown>(
  rawText: string,
  maxBytes: number = MAX_TRANSFER_FILE_BYTES
): T {
  if (typeof rawText !== 'string') {
    throw new Error('Transfer input must be a string.');
  }
  const byteLen = new TextEncoder().encode(rawText).byteLength;
  if (byteLen > maxBytes) {
    throw new Error(
      `Transfer payload exceeds maximum safe size (${Math.round(
        maxBytes / (1024 * 1024)
      )} MB limit).`
    );
  }
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Transfer payload is empty.');
  }
  return JSON.parse(trimmed, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  }) as T;
}

/**
 * Recursively strips any forbidden credential or key fields so secrets are never exported.
 */
export function scrubSecretsFromObject<T>(input: T): T {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => scrubSecretsFromObject(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_SECRET_KEYS.has(k.toLowerCase())) {
      continue;
    }
    out[k] = scrubSecretsFromObject(v);
  }
  return out as T;
}

/**
 * Computes a deterministic SHA-256 hex digest over portable items for integrity verification.
 */
export async function computeTransferIntegrityHash(
  items: PortableTransferItem[]
): Promise<string> {
  const canonical = items.map((it) => ({
    id: it.id || '',
    type: it.type || 'link',
    title: it.title || '',
    url: it.url || '',
    content: it.content || '',
    notes: it.notes || '',
    tags: Array.isArray(it.tags) ? [...it.tags].sort() : [],
    category: it.category || '',
  }));
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts internal VaultItem to PortableTransferItem (.gvault schema v1).
 */
export function toPortableTransferItem(
  item: VaultItem,
  collectionsMap: Map<string, string>
): PortableTransferItem {
  const portableType: PortableItemType =
    item.type === 'github' ? 'repository' : item.type;
  const categoryName =
    item.category ||
    collectionsMap.get(item.collectionId) ||
    (item.type === 'github' ? 'Development' : 'General');

  const portable: PortableTransferItem = {
    id: item.id,
    type: portableType,
    title: item.title,
    url: item.url || undefined,
    description: item.description || undefined,
    platform:
      item.platform || (item.type === 'github' ? 'GitHub' : undefined),
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    category: categoryName,
    collectionId: item.collectionId,
    notes: item.notes || undefined,
    content: item.content || undefined,
    favicon: item.favicon || undefined,
    ownerRepo: item.ownerRepo || undefined,
    stars: typeof item.stars === 'number' ? item.stars : undefined,
    language: item.language || undefined,
    lastUpdated: item.lastUpdated || undefined,
    readmePreview: item.readmePreview || undefined,
    startDate: item.startDate || undefined,
    deadline: item.deadline || undefined,
    hackathonStatus: item.hackathonStatus || undefined,
    teamMembers: item.teamMembers ? [...item.teamMembers] : undefined,
    pinned: Boolean(item.pinned),
    favourite: Boolean(item.favourite),
    archived: Boolean(item.archived),
    openCount: item.openCount || 0,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    syncVersion: item.syncVersion ?? 1,
    contentHash: item.contentHash,
  };

  return scrubSecretsFromObject(portable);
}

/**
 * Serializes selected VaultItems into a UniversalTransferFile (.gvault v1).
 */
export async function createUniversalTransferObject(
  items: VaultItem[],
  collections: VaultCollection[] = [],
  tags: VaultTag[] = []
): Promise<UniversalTransferFile> {
  if (items.length > MAX_TRANSFER_ITEM_COUNT) {
    throw new Error(
      `Export exceeds maximum item count (${MAX_TRANSFER_ITEM_COUNT} items).`
    );
  }
  const collectionsMap = new Map(collections.map((c) => [c.id, c.name]));
  const portableItems = items.map((item) =>
    toPortableTransferItem(item, collectionsMap)
  );
  const integrityHash = await computeTransferIntegrityHash(portableItems);

  const envelope: UniversalTransferFile = {
    format: GVAULT_FORMAT_PRIMARY,
    schemaVersion: GVAULT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    application: 'Guardian Vault',
    sourcePlatform: detectVisitorOS(),
    itemCount: portableItems.length,
    integrityHash,
    items: portableItems,
    collections: collections.length > 0 ? scrubSecretsFromObject(collections) : undefined,
    tags: tags.length > 0 ? scrubSecretsFromObject(tags) : undefined,
  };

  return scrubSecretsFromObject(envelope);
}

export async function serializeToUniversalGvault(
  items: VaultItem[],
  collections: VaultCollection[] = [],
  tags: VaultTag[] = []
): Promise<string> {
  const obj = await createUniversalTransferObject(items, collections, tags);
  return JSON.stringify(obj, null, 2);
}

/**
 * Builds the human-readable plain-text fallback + portable .gvault block for universal clipboard copy.
 */
export async function buildUniversalClipboardPayload(
  items: VaultItem[],
  collections: VaultCollection[] = [],
  tags: VaultTag[] = []
): Promise<{
  gvaultJson: string;
  plainTextFallback: string;
  combinedClipboardText: string;
}> {
  const gvaultObj = await createUniversalTransferObject(items, collections, tags);
  const gvaultJson = JSON.stringify(gvaultObj, null, 2);

  const humanLines = items.map((item) => {
    if (item.url) {
      return `${item.title} — ${item.url}`;
    }
    if (item.content) {
      return `${item.title}: ${item.content.slice(0, 140).replace(/\n+/g, ' ')}`;
    }
    return item.title;
  });

  const urlOnlyLines = items
    .map((i) => i.url || i.title)
    .filter(Boolean)
    .join('\n');

  const combinedClipboardText = `${urlOnlyLines}\n\n${CLIPBOARD_BLOCK_START}\n${gvaultJson}\n${CLIPBOARD_BLOCK_END}`;

  const byteLen = new TextEncoder().encode(combinedClipboardText).byteLength;
  if (byteLen > MAX_CLIPBOARD_BYTES) {
    throw new Error(
      'Selection is too large for system clipboard (>2 MB). Please use Export .gvault File instead.'
    );
  }

  return {
    gvaultJson,
    plainTextFallback: humanLines.join('\n'),
    combinedClipboardText,
  };
}

/**
 * Copies selected items to the system clipboard using the Web Clipboard API with fallback.
 */
export async function copyItemsToUniversalClipboard(
  items: VaultItem[],
  collections: VaultCollection[] = [],
  tags: VaultTag[] = []
): Promise<{ itemCount: number; gvaultJson: string; combinedText: string }> {
  if (!items || items.length === 0) {
    throw new Error('Select at least one item to copy.');
  }

  const { gvaultJson, combinedClipboardText } =
    await buildUniversalClipboardPayload(items, collections, tags);

  let copied = false;

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(combinedClipboardText);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied && typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = combinedClipboardText;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      copied = true;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  return {
    itemCount: items.length,
    gvaultJson,
    combinedText: combinedClipboardText,
  };
}

/**
 * Encrypts a UniversalTransferFile (.gvault) with a user-supplied export password using AES-256-GCM.
 */
export async function encryptUniversalGvault(
  items: VaultItem[],
  password: string,
  collections: VaultCollection[] = [],
  tags: VaultTag[] = [],
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<EncryptedUniversalTransferFile> {
  if (!password || password.trim().length < 4) {
    throw new Error(
      'Export password must be at least 4 characters for encrypted .gvault files.'
    );
  }
  const transferObj = await createUniversalTransferObject(items, collections, tags);
  const salt = generateSalt();
  const key = await deriveMasterKey(password, salt, iterations);
  const { iv, ciphertext } = await encryptJson(key, transferObj);

  return {
    format: GVAULT_ENCRYPTED_FORMAT,
    schemaVersion: GVAULT_SCHEMA_VERSION,
    exportedAt: transferObj.exportedAt,
    application: 'Guardian Vault',
    kdf: 'PBKDF2-HMAC-SHA256',
    cipher: 'AES-256-GCM',
    iterations,
    salt,
    iv,
    ciphertext,
    itemCount: items.length,
  };
}

/**
 * Binary packet encryption matching PDF Section 2 & 7.3: [version(1) || salt(16) || iv(12) || ciphertext+authTag]
 */
export async function encryptBinaryGvaultPacket(
  jsonString: string,
  password: string,
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<Uint8Array> {
  const saltBase64 = generateSalt();
  const saltBytes = base64ToBytes(saltBase64);
  const key = await deriveMasterKey(password, saltBase64, iterations);
  const plainBytes = new TextEncoder().encode(jsonString);
  const { iv, ciphertext } = await encryptBytes(key, plainBytes);
  const ivBytes = base64ToBytes(iv);
  const cipherBytes = base64ToBytes(ciphertext);

  const packet = new Uint8Array(
    1 + saltBytes.byteLength + ivBytes.byteLength + cipherBytes.byteLength
  );
  packet[0] = GVAULT_SCHEMA_VERSION;
  packet.set(saltBytes, 1);
  packet.set(ivBytes, 1 + 16);
  packet.set(cipherBytes, 1 + 16 + 12);
  return packet;
}

export async function decryptBinaryGvaultPacket(
  packet: Uint8Array,
  password: string,
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<string> {
  if (!packet || packet.byteLength < 1 + 16 + 12 + 16) {
    throw new Error('Corrupted binary .gvault packet (too short).');
  }
  const version = packet[0];
  if (version !== GVAULT_SCHEMA_VERSION) {
    throw new Error(`Unsupported binary .gvault packet version: ${version}`);
  }
  const saltBytes = packet.slice(1, 17);
  const ivBytes = packet.slice(17, 29);
  const cipherBytes = packet.slice(29);

  const saltBase64 = bytesToBase64(saltBytes);
  const ivBase64 = bytesToBase64(ivBytes);
  const cipherBase64 = bytesToBase64(cipherBytes);

  try {
    const key = await deriveMasterKey(password, saltBase64, iterations);
    const plainBytes = await decryptBytes(key, ivBase64, cipherBase64);
    return new TextDecoder().decode(plainBytes);
  } catch {
    throw new Error(
      'Decryption failed: incorrect export password or tampered .gvault file.'
    );
  }
}

export function isEncryptedGvaultObject(
  obj: unknown
): obj is EncryptedUniversalTransferFile {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  return (
    rec.format === GVAULT_ENCRYPTED_FORMAT &&
    typeof rec.salt === 'string' &&
    typeof rec.iv === 'string' &&
    typeof rec.ciphertext === 'string'
  );
}

export async function decryptUniversalGvault(
  encryptedObj: EncryptedUniversalTransferFile,
  password: string
): Promise<UniversalTransferFile> {
  if (!isEncryptedGvaultObject(encryptedObj)) {
    throw new Error('Invalid encrypted .gvault structure.');
  }
  if (!password) {
    throw new Error('Password is required to decrypt this .gvault transfer.');
  }
  const iterations =
    typeof encryptedObj.iterations === 'number' &&
    encryptedObj.iterations >= 1_000
      ? encryptedObj.iterations
      : PBKDF2_ITERATIONS_V2;
  try {
    const key = await deriveMasterKey(password, encryptedObj.salt, iterations);
    return await decryptJson<UniversalTransferFile>(
      key,
      encryptedObj.iv,
      encryptedObj.ciphertext
    );
  } catch {
    throw new Error(
      'Import failed: incorrect export password or corrupted .gvault file.'
    );
  }
}

/**
 * Schema migration helper for .gvault files across versions.
 */
export function migrateGvaultSchema(rawObj: Record<string, unknown>): {
  items: unknown[];
  collections: VaultCollection[];
  tags: VaultTag[];
  integrityHash?: string;
} {
  const version =
    typeof rawObj.schemaVersion === 'number'
      ? rawObj.schemaVersion
      : typeof rawObj.version === 'number'
      ? rawObj.version
      : 1;

  if (version > GVAULT_SCHEMA_VERSION) {
    // Forward-compatible migration: preserve known fields and ignore unknown fields
  }

  const rawItems = Array.isArray(rawObj.items) ? rawObj.items : [];
  if (rawItems.length > MAX_TRANSFER_ITEM_COUNT) {
    throw new Error(
      `Transfer file contains ${rawItems.length} items, exceeding limit of ${MAX_TRANSFER_ITEM_COUNT}.`
    );
  }

  const collections: VaultCollection[] = Array.isArray(rawObj.collections)
    ? (rawObj.collections as VaultCollection[])
    : [];
  const tags: VaultTag[] = Array.isArray(rawObj.tags)
    ? (rawObj.tags as VaultTag[])
    : [];

  return {
    items: rawItems,
    collections,
    tags,
    integrityHash:
      typeof rawObj.integrityHash === 'string'
        ? rawObj.integrityHash
        : undefined,
  };
}

export interface ParsedCandidateRecord {
  status: 'valid' | 'invalid' | 'unsupported';
  item: VaultItem;
  reason?: string;
}

/**
 * Validates and converts a single raw record from a .gvault or JSON import into a VaultItem.
 */
export function validateAndNormalizeRawItem(
  raw: unknown,
  idx: number,
  collections: VaultCollection[] = []
): ParsedCandidateRecord {
  const nowIso = new Date().toISOString();
  const fallbackItem: VaultItem = {
    id: `invalid-${idx}`,
    type: 'link',
    title: 'Invalid Record',
    tags: [],
    collectionId: 'col-general',
    pinned: false,
    favourite: false,
    archived: false,
    trashed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    openCount: 0,
  };

  if (!raw || typeof raw !== 'object') {
    return {
      status: 'invalid',
      item: fallbackItem,
      reason: 'Record is not a valid JSON object.',
    };
  }

  const rec = raw as Record<string, unknown>;
  const rawType = String(rec.type || 'link')
    .toLowerCase()
    .trim();

  let mappedType: ItemType;
  if (rawType === 'link' || rawType === 'bookmark' || rawType === 'website') {
    mappedType = 'link';
  } else if (
    rawType === 'repository' ||
    rawType === 'github' ||
    rawType === 'repo'
  ) {
    mappedType = 'github';
  } else if (rawType === 'note' || rawType === 'markdown') {
    mappedType = 'note';
  } else if (rawType === 'hackathon') {
    mappedType = 'hackathon';
  } else {
    return {
      status: 'unsupported',
      item: {
        ...fallbackItem,
        title: String(rec.title || rec.subject || `Record #${idx + 1}`),
      },
      reason: `Unsupported item type "${String(rec.type)}".`,
    };
  }

  const rawTitle = String(rec.title ?? rec.subject ?? '').trim();
  const rawUrl = typeof rec.url === 'string' ? rec.url.trim() : '';

  if (!rawTitle && !rawUrl) {
    return {
      status: 'invalid',
      item: fallbackItem,
      reason: 'Missing required title and URL.',
    };
  }

  if (
    (mappedType === 'link' || mappedType === 'github') &&
    rawUrl &&
    !isValidTransferUrl(rawUrl)
  ) {
    return {
      status: 'invalid',
      item: {
        ...fallbackItem,
        type: mappedType,
        title: rawTitle || rawUrl,
        url: rawUrl,
      },
      reason: `Unsafe or invalid URL scheme: "${rawUrl}". Only HTTP/HTTPS URLs are permitted.`,
    };
  }

  if (
    (mappedType === 'link' || mappedType === 'github') &&
    !rawUrl
  ) {
    return {
      status: 'invalid',
      item: {
        ...fallbackItem,
        type: mappedType,
        title: rawTitle,
      },
      reason: `${mappedType === 'github' ? 'Repository' : 'Link'} record is missing a URL.`,
    };
  }

  // Resolve collectionId from category name or existing collectionId
  let resolvedCollectionId =
    typeof rec.collectionId === 'string' && rec.collectionId.trim()
      ? rec.collectionId.trim()
      : '';
  const categoryName =
    typeof rec.category === 'string' ? rec.category.trim() : '';

  if (!resolvedCollectionId && categoryName) {
    const matchedCol = collections.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase()
    );
    if (matchedCol) {
      resolvedCollectionId = matchedCol.id;
    } else {
      const slug = categoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      resolvedCollectionId = slug ? `col-${slug}` : 'col-general';
    }
  }
  if (!resolvedCollectionId) {
    resolvedCollectionId =
      mappedType === 'github' ? 'col-dev' : 'col-general';
  }

  const detectedUrl = rawUrl ? detectUrlType(rawUrl) : null;
  const normalizedUrlString = detectedUrl
    ? detectedUrl.normalizedHref
    : undefined;

  const ownerRepo =
    typeof rec.ownerRepo === 'string' && rec.ownerRepo.trim()
      ? rec.ownerRepo.trim()
      : detectedUrl?.ownerRepo;

  const tags: string[] = Array.isArray(rec.tags)
    ? rec.tags
        .map((t) => String(t).trim())
        .filter(Boolean)
    : [];

  const createdAt =
    typeof rec.createdAt === 'string' && !Number.isNaN(Date.parse(rec.createdAt))
      ? new Date(rec.createdAt).toISOString()
      : nowIso;

  const updatedAt =
    typeof rec.updatedAt === 'string' && !Number.isNaN(Date.parse(rec.updatedAt))
      ? new Date(rec.updatedAt).toISOString()
      : createdAt;

  const hackathonStatus =
    typeof rec.hackathonStatus === 'string' &&
    VALID_HACKATHON_STATUSES.has(rec.hackathonStatus as HackathonStatus)
      ? (rec.hackathonStatus as HackathonStatus)
      : undefined;

  const portableId =
    typeof rec.id === 'string' && rec.id.trim()
      ? rec.id.trim()
      : `gvault-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`;

  const item: VaultItem = {
    id: portableId,
    type: mappedType,
    title: rawTitle || detectedUrl?.suggestedTitle || 'Untitled Item',
    url: normalizedUrlString,
    description:
      typeof rec.description === 'string' ? rec.description : undefined,
    platform:
      typeof rec.platform === 'string'
        ? rec.platform
        : mappedType === 'github'
        ? 'GitHub'
        : undefined,
    category: categoryName || undefined,
    favicon: typeof rec.favicon === 'string' ? rec.favicon : undefined,
    ownerRepo,
    stars: typeof rec.stars === 'number' ? rec.stars : undefined,
    language: typeof rec.language === 'string' ? rec.language : undefined,
    lastUpdated:
      typeof rec.lastUpdated === 'string' ? rec.lastUpdated : undefined,
    notes: typeof rec.notes === 'string' ? rec.notes : undefined,
    readmePreview:
      typeof rec.readmePreview === 'string' ? rec.readmePreview : undefined,
    content: typeof rec.content === 'string' ? rec.content : undefined,
    startDate: typeof rec.startDate === 'string' ? rec.startDate : undefined,
    deadline: typeof rec.deadline === 'string' ? rec.deadline : undefined,
    hackathonStatus,
    teamMembers: Array.isArray(rec.teamMembers)
      ? rec.teamMembers.map((m) => String(m).trim()).filter(Boolean)
      : undefined,
    tags,
    collectionId: resolvedCollectionId,
    pinned: Boolean(rec.pinned),
    favourite: Boolean(rec.favourite),
    archived: Boolean(rec.archived),
    trashed: false,
    createdAt,
    updatedAt,
    openCount: typeof rec.openCount === 'number' ? rec.openCount : 0,
    syncVersion: typeof rec.syncVersion === 'number' ? rec.syncVersion : 1,
    contentHash:
      typeof rec.contentHash === 'string' ? rec.contentHash : undefined,
  };

  return {
    status: 'valid',
    item,
  };
}

/**
 * Encodes 1..10 items into a compact QR transfer string (plain or password-encrypted).
 */
export async function encodeQrTransferString(
  items: VaultItem[],
  password?: string,
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<string> {
  if (!items || items.length === 0) {
    throw new Error('Select at least 1 item to generate a QR transfer code.');
  }
  if (items.length > MAX_QR_TRANSFER_ITEMS) {
    throw new Error(
      `QR transfer supports up to ${MAX_QR_TRANSFER_ITEMS} items at once. Use .gvault file export for larger sets.`
    );
  }

  const compactItems = items.map((it) => ({
    i: it.id,
    y: it.type === 'github' ? 'repository' : it.type,
    t: it.title,
    u: it.url || undefined,
    d: it.description ? it.description.slice(0, 160) : undefined,
    g: it.tags.slice(0, 5),
    n: it.notes ? it.notes.slice(0, 160) : undefined,
    c: it.content ? it.content.slice(0, 240) : undefined,
  }));

  const jsonPayload = JSON.stringify({
    f: GVAULT_FORMAT_PRIMARY,
    v: GVAULT_SCHEMA_VERSION,
    items: compactItems,
  });

  if (password && password.trim().length > 0) {
    const packet = await encryptBinaryGvaultPacket(
      jsonPayload,
      password,
      iterations
    );
    return `${QR_ENCRYPTED_PREFIX}${bytesToBase64(packet)}`;
  }

  const encodedBytes = new TextEncoder().encode(jsonPayload);
  return `${QR_PLAIN_PREFIX}${bytesToBase64(encodedBytes)}`;
}

/**
 * Decodes a QR transfer string (`GVQR1:...` or `GVQRE1:...`) back into UniversalTransferFile JSON.
 */
export async function decodeQrTransferString(
  qrString: string,
  password?: string,
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<string> {
  const trimmed = qrString.trim();
  let jsonStr = '';

  if (trimmed.startsWith(QR_ENCRYPTED_PREFIX)) {
    if (!password) {
      throw new Error('PASSWORD_REQUIRED: This QR transfer is password-encrypted.');
    }
    const b64 = trimmed.slice(QR_ENCRYPTED_PREFIX.length);
    const packet = base64ToBytes(b64);
    jsonStr = await decryptBinaryGvaultPacket(packet, password, iterations);
  } else if (trimmed.startsWith(QR_PLAIN_PREFIX)) {
    const b64 = trimmed.slice(QR_PLAIN_PREFIX.length);
    const bytes = base64ToBytes(b64);
    jsonStr = new TextDecoder().decode(bytes);
  } else {
    jsonStr = trimmed;
  }

  const parsed = safeParseJson<Record<string, unknown>>(jsonStr);
  if (parsed.f === GVAULT_FORMAT_PRIMARY && Array.isArray(parsed.items)) {
    const expandedItems = (parsed.items as Array<Record<string, unknown>>).map(
      (c, idx) => ({
        id: String(c.i || `qr-${Date.now()}-${idx}`),
        type: String(c.y || 'link'),
        title: String(c.t || 'Scanned Item'),
        url: typeof c.u === 'string' ? c.u : undefined,
        description: typeof c.d === 'string' ? c.d : undefined,
        tags: Array.isArray(c.g) ? c.g : [],
        notes: typeof c.n === 'string' ? c.n : undefined,
        content: typeof c.c === 'string' ? c.c : undefined,
        createdAt: new Date().toISOString(),
      })
    );
    return JSON.stringify({
      format: GVAULT_FORMAT_PRIMARY,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      application: 'Guardian Vault',
      itemCount: expandedItems.length,
      items: expandedItems,
    });
  }

  return jsonStr;
}

export function isTransferInputEncrypted(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(QR_ENCRYPTED_PREFIX)) return true;

  const blockStartIdx = trimmed.indexOf(CLIPBOARD_BLOCK_START);
  const blockEndIdx = trimmed.indexOf(CLIPBOARD_BLOCK_END);
  const candidateJson =
    blockStartIdx !== -1 && blockEndIdx > blockStartIdx
      ? trimmed
          .slice(blockStartIdx + CLIPBOARD_BLOCK_START.length, blockEndIdx)
          .trim()
      : trimmed;

  try {
    const parsed = JSON.parse(candidateJson);
    return (
      isEncryptedGvaultObject(parsed) || isEncryptedVaultFileObject(parsed)
    );
  } catch {
    return false;
  }
}

/**
 * Universal parser & preview analyzer for any clipboard text, .gvault file, .vault file, bookmarks HTML, QR string, or plain URLs.
 */
export async function parseAndAnalyzeTransferInput(
  rawInput: string,
  existingItems: VaultItem[],
  existingCollections: VaultCollection[],
  password?: string
): Promise<ImportPreviewAnalysis> {
  if (!rawInput || !rawInput.trim()) {
    throw new Error('No transfer data found to import.');
  }

  const byteLen = new TextEncoder().encode(rawInput).byteLength;
  if (byteLen > MAX_TRANSFER_FILE_BYTES) {
    throw new Error(
      `Transfer file exceeds maximum allowed size (${Math.round(
        MAX_TRANSFER_FILE_BYTES / (1024 * 1024)
      )} MB).`
    );
  }

  let workingText = rawInput.trim();
  let sourceFormat = 'Universal .gvault Transfer';

  // 1. Check if input is a compact QR transfer string
  if (
    workingText.startsWith(QR_PLAIN_PREFIX) ||
    workingText.startsWith(QR_ENCRYPTED_PREFIX)
  ) {
    workingText = await decodeQrTransferString(workingText, password);
    sourceFormat = 'QR Code Transfer (.gvault)';
  }

  // 2. Check if input is a combined clipboard payload with a .gvault block
  const blockStart = workingText.indexOf(CLIPBOARD_BLOCK_START);
  const blockEnd = workingText.indexOf(CLIPBOARD_BLOCK_END);
  if (blockStart !== -1 && blockEnd > blockStart) {
    workingText = workingText
      .slice(blockStart + CLIPBOARD_BLOCK_START.length, blockEnd)
      .trim();
    sourceFormat = 'Universal Clipboard (.gvault)';
  }

  let parsedCandidateList: ParsedCandidateRecord[] = [];
  let importedCollections: VaultCollection[] = [];
  let importedTags: VaultTag[] = [];

  // 3. Check if Netscape Bookmarks HTML
  if (
    workingText.startsWith('<!DOCTYPE NETSCAPE') ||
    workingText.includes('<DL><p>') ||
    workingText.includes('<A HREF=')
  ) {
    const drafts = parseBookmarksHtml(workingText);
    sourceFormat = 'Browser Bookmarks HTML';
    parsedCandidateList = drafts.map((d, idx) =>
      validateAndNormalizeRawItem(d, idx, existingCollections)
    );
  } else if (workingText.startsWith('{') || workingText.startsWith('[')) {
    // 4. Parse JSON (either .gvault, encrypted .gvault, encrypted .vault, or plain JSON)
    let parsedJson: unknown;
    try {
      parsedJson = safeParseJson(workingText);
    } catch {
      throw new Error(
        'Malformed JSON: The transfer data or file is corrupted and cannot be parsed.'
      );
    }

    if (isEncryptedGvaultObject(parsedJson)) {
      if (!password) {
        throw new Error(
          'PASSWORD_REQUIRED: Enter the export password to decrypt this .gvault file.'
        );
      }
      const decrypted = await decryptUniversalGvault(parsedJson, password);
      sourceFormat = 'Encrypted .gvault (AES-256-GCM)';
      const migrated = migrateGvaultSchema(
        decrypted as unknown as Record<string, unknown>
      );
      importedCollections = migrated.collections;
      importedTags = migrated.tags;
      parsedCandidateList = migrated.items.map((raw, idx) =>
        validateAndNormalizeRawItem(raw, idx, [
          ...existingCollections,
          ...importedCollections,
        ])
      );
    } else if (isEncryptedVaultFileObject(parsedJson)) {
      if (!password) {
        throw new Error(
          'PASSWORD_REQUIRED: Enter the password to decrypt this .vault backup.'
        );
      }
      let decrypted: DecryptedVaultPayload;
      try {
        decrypted = await decryptVaultFileWithPassword(
          parsedJson as EncryptedVaultFile,
          password
        );
      } catch {
        throw new Error(
          'Import failed: incorrect password or corrupted .vault archive.'
        );
      }
      sourceFormat = 'Encrypted .vault Archive';
      importedCollections = decrypted.collections || [];
      importedTags = decrypted.tags || [];
      parsedCandidateList = (decrypted.items || []).map((raw, idx) =>
        validateAndNormalizeRawItem(raw, idx, [
          ...existingCollections,
          ...importedCollections,
        ])
      );
    } else if (Array.isArray(parsedJson)) {
      sourceFormat = 'JSON Item Array';
      parsedCandidateList = parsedJson.map((raw, idx) =>
        validateAndNormalizeRawItem(raw, idx, existingCollections)
      );
    } else if (parsedJson && typeof parsedJson === 'object') {
      const obj = parsedJson as Record<string, unknown>;
      const fmt = String(obj.format || '');
      if (
        fmt === GVAULT_FORMAT_PRIMARY ||
        fmt === GVAULT_FORMAT_ALT ||
        Array.isArray(obj.items)
      ) {
        if (
          obj.format &&
          fmt !== GVAULT_FORMAT_PRIMARY &&
          fmt !== GVAULT_FORMAT_ALT
        ) {
          throw new Error(`Unsupported transfer format header: "${fmt}".`);
        }

        const migrated = migrateGvaultSchema(obj);
        importedCollections = migrated.collections;
        importedTags = migrated.tags;

        // Verify integrity hash if present and unmodified portable items
        if (migrated.integrityHash && Array.isArray(obj.items)) {
          const computedHash = await computeTransferIntegrityHash(
            obj.items as PortableTransferItem[]
          );
          if (computedHash !== migrated.integrityHash) {
            throw new Error(
              'Integrity check failed: The transfer file has been modified or corrupted.'
            );
          }
        }

        // Synthesize collections for any custom category names in .gvault items
        const knownColNames = new Set(
          [...existingCollections, ...importedCollections].map((c) =>
            c.name.toLowerCase()
          )
        );
        for (const rawItem of migrated.items) {
          if (rawItem && typeof rawItem === 'object') {
            const cat = (rawItem as Record<string, unknown>).category;
            if (typeof cat === 'string' && cat.trim()) {
              const cleanCat = cat.trim();
              if (
                !knownColNames.has(cleanCat.toLowerCase()) &&
                cleanCat.toLowerCase() !== 'general' &&
                cleanCat.toLowerCase() !== 'development'
              ) {
                const slug = cleanCat
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '');
                if (slug) {
                  knownColNames.add(cleanCat.toLowerCase());
                  importedCollections.push({
                    id: `col-${slug}`,
                    name: cleanCat,
                    createdAt: new Date().toISOString(),
                  });
                }
              }
            }
          }
        }

        parsedCandidateList = migrated.items.map((raw, idx) =>
          validateAndNormalizeRawItem(raw, idx, [
            ...existingCollections,
            ...importedCollections,
          ])
        );
      } else {
        throw new Error(
          'Unrecognized JSON structure. Expected a Guardian Vault .gvault transfer file.'
        );
      }
    }
  } else {
    // 5. Fallback: Parse compatible plain-text URLs (one or multiple URLs in clipboard text)
    const lines = workingText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const extractedUrls: string[] = [];
    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s"'<>]+/i);
      if (urlMatch) {
        extractedUrls.push(urlMatch[0]);
      } else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(line)) {
        extractedUrls.push(`https://${line}`);
      }
    }

    if (extractedUrls.length === 0) {
      throw new Error(
        'Clipboard does not contain valid Guardian Vault transfer data or recognizable URLs.'
      );
    }

    sourceFormat = 'Plain-Text URLs';
    parsedCandidateList = extractedUrls.map((u, idx) => {
      const detected = detectUrlType(u);
      return validateAndNormalizeRawItem(
        {
          id: `url-${Date.now()}-${idx}`,
          type: detected.type,
          title: detected.suggestedTitle,
          url: detected.normalizedHref,
          ownerRepo: detected.ownerRepo,
          tags: ['pasted'],
        },
        idx,
        existingCollections
      );
    });
  }

  // Build duplicate lookup maps using ONLY normalized URLs and stable IDs (never titles alone!)
  const activeExisting = existingItems.filter((i) => !i.trashed);
  const existingById = new Map<string, VaultItem>();
  const existingByNormUrl = new Map<string, VaultItem>();

  for (const ex of activeExisting) {
    if (ex.id) {
      existingById.set(ex.id, ex);
    }
    if (ex.url) {
      const norm = normalizeUrl(ex.url);
      if (norm) {
        existingByNormUrl.set(norm, ex);
      }
    }
  }

  let linkCount = 0;
  let repoCount = 0;
  let noteCount = 0;
  let hackathonCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let unsupportedCount = 0;

  const candidates: ImportCandidateEntry[] = parsedCandidateList.map(
    (parsed, index) => {
      const { item, status, reason } = parsed;

      if (status === 'invalid') {
        invalidCount++;
        return { index, item, status: 'invalid', reason };
      }
      if (status === 'unsupported') {
        unsupportedCount++;
        return { index, item, status: 'unsupported', reason };
      }

      if (item.type === 'link') linkCount++;
      else if (item.type === 'github') repoCount++;
      else if (item.type === 'note') noteCount++;
      else if (item.type === 'hackathon') hackathonCount++;

      const normUrl = item.url ? normalizeUrl(item.url) : '';
      const urlMatch = normUrl ? existingByNormUrl.get(normUrl) : undefined;
      const idMatch = item.id ? existingById.get(item.id) : undefined;

      if (urlMatch) {
        duplicateCount++;
        return {
          index,
          item,
          status: 'duplicate',
          duplicateMatchBy: 'url',
          existingItem: urlMatch,
          reason: `Matches existing URL (${urlMatch.title})`,
        };
      }

      if (idMatch) {
        duplicateCount++;
        return {
          index,
          item,
          status: 'duplicate',
          duplicateMatchBy: 'id',
          existingItem: idMatch,
          reason: `Matches existing item ID (${idMatch.title})`,
        };
      }

      newCount++;
      return {
        index,
        item,
        status: 'new',
      };
    }
  );

  return {
    totalDetected: candidates.length,
    linkCount,
    repoCount,
    noteCount,
    hackathonCount,
    newCount,
    duplicateCount,
    invalidCount,
    unsupportedCount,
    candidates,
    collections: importedCollections,
    tags: importedTags,
    sourceFormat,
  };
}

/**
 * Resolves which items to persist into the vault based on user's selected candidate indices,
 * duplicate resolution strategy ('skip' | 'replace' | 'keep_both'), and explicit replace confirmation.
 */
export function resolveSelectiveImport(
  analysis: ImportPreviewAnalysis,
  existingItems: VaultItem[],
  selectedIndices: Set<number>,
  strategy: DuplicateStrategy,
  explicitReplaceConfirmed: boolean = false
): {
  nextItems: VaultItem[];
  itemsToPersist: VaultItem[];
  report: ImportExecutionReport;
} {
  if (strategy === 'replace' && !explicitReplaceConfirmed) {
    throw new Error(
      'Replacing existing records requires explicit confirmation.'
    );
  }

  const nextItems = [...existingItems];
  const itemsToPersist: VaultItem[] = [];

  let newImportedCount = 0;
  let replacedCount = 0;
  let keptBothCount = 0;
  let skippedDuplicatesCount = 0;
  let rejectedInvalidCount = 0;

  for (const entry of analysis.candidates) {
    if (entry.status === 'invalid' || entry.status === 'unsupported') {
      rejectedInvalidCount++;
      continue;
    }

    if (!selectedIndices.has(entry.index)) {
      if (entry.status === 'duplicate') {
        skippedDuplicatesCount++;
      }
      continue;
    }

    const incoming = entry.item;

    // Re-check against nextItems by normalized URL or stable ID (never by title alone!)
    const normIncomingUrl = incoming.url ? normalizeUrl(incoming.url) : '';
    const duplicateIdx = nextItems.findIndex((existing) => {
      if (existing.trashed) return false;
      if (
        normIncomingUrl &&
        existing.url &&
        normalizeUrl(existing.url) === normIncomingUrl
      ) {
        return true;
      }
      if (incoming.id && existing.id === incoming.id) {
        return true;
      }
      return false;
    });

    if (duplicateIdx !== -1) {
      if (strategy === 'skip') {
        skippedDuplicatesCount++;
        continue;
      } else if (strategy === 'replace') {
        const existingTarget = nextItems[duplicateIdx];
        const replaced: VaultItem = {
          ...existingTarget,
          ...incoming,
          id: existingTarget.id,
          syncVersion: (existingTarget.syncVersion ?? 1) + 1,
          updatedAt: new Date().toISOString(),
        };
        nextItems[duplicateIdx] = replaced;
        itemsToPersist.push(replaced);
        replacedCount++;
      } else if (strategy === 'keep_both') {
        const copyItem: VaultItem = {
          ...incoming,
          id: `imp-${Date.now()}-${entry.index}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          title: `${incoming.title} (Imported)`,
          syncVersion: 1,
          updatedAt: new Date().toISOString(),
        };
        nextItems.unshift(copyItem);
        itemsToPersist.push(copyItem);
        keptBothCount++;
      }
    } else {
      const freshId =
        incoming.id && !nextItems.some((e) => e.id === incoming.id)
          ? incoming.id
          : `imp-${Date.now()}-${entry.index}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
      const freshItem: VaultItem = {
        ...incoming,
        id: freshId,
        syncVersion: incoming.syncVersion ?? 1,
      };
      nextItems.unshift(freshItem);
      itemsToPersist.push(freshItem);
      newImportedCount++;
    }
  }

  const importedCount = newImportedCount + replacedCount + keptBothCount;

  return {
    nextItems,
    itemsToPersist,
    report: {
      importedCount,
      newImportedCount,
      replacedCount,
      keptBothCount,
      skippedDuplicatesCount,
      rejectedInvalidCount,
    },
  };
}

/**
 * Future Synchronization Architecture:
 * Computes incremental sync diff between local and remote item sets using stable IDs,
 * version numbers (`syncVersion`), and `updatedAt` timestamps.
 */
export interface SyncDiffResult {
  toPushToRemote: VaultItem[];
  toPullFromRemote: VaultItem[];
  conflicts: Array<{ local: VaultItem; remote: VaultItem }>;
  unchangedCount: number;
}

export function computeIncrementalSyncDiff(
  localItems: VaultItem[],
  remoteItems: VaultItem[],
  lastSyncedAtIso?: string
): SyncDiffResult {
  const localMap = new Map(localItems.map((i) => [i.id, i]));
  const remoteMap = new Map(remoteItems.map((i) => [i.id, i]));
  const lastSyncMs = lastSyncedAtIso ? new Date(lastSyncedAtIso).getTime() : 0;

  const toPushToRemote: VaultItem[] = [];
  const toPullFromRemote: VaultItem[] = [];
  const conflicts: Array<{ local: VaultItem; remote: VaultItem }> = [];
  let unchangedCount = 0;

  for (const [id, local] of localMap.entries()) {
    const remote = remoteMap.get(id);
    if (!remote) {
      toPushToRemote.push(local);
      continue;
    }

    const localVer = local.syncVersion ?? 1;
    const remoteVer = remote.syncVersion ?? 1;
    const localTime = new Date(local.updatedAt).getTime();
    const remoteTime = new Date(remote.updatedAt).getTime();

    if (localVer === remoteVer && localTime === remoteTime) {
      unchangedCount++;
    } else if (
      lastSyncMs > 0 &&
      localTime > lastSyncMs &&
      remoteTime > lastSyncMs &&
      localTime !== remoteTime
    ) {
      conflicts.push({ local, remote });
    } else if (localVer > remoteVer || localTime > remoteTime) {
      toPushToRemote.push(local);
    } else {
      toPullFromRemote.push(remote);
    }
  }

  for (const [id, remote] of remoteMap.entries()) {
    if (!localMap.has(id)) {
      toPullFromRemote.push(remote);
    }
  }

  return {
    toPushToRemote,
    toPullFromRemote,
    conflicts,
    unchangedCount,
  };
}
