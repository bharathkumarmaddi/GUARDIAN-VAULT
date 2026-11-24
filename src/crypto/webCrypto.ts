import {
  DecryptedVaultPayload,
  EncryptedVaultFile,
  WrappedKeySlot,
} from '../types/vault';

export const VAULT_FORMAT_VERSION_V1 = 1;
export const VAULT_FORMAT_VERSION_V2 = 2;
export const VAULT_FORMAT_VERSION_V3 = 3;
export const CURRENT_VAULT_FORMAT_VERSION = VAULT_FORMAT_VERSION_V3;

export const PBKDF2_ITERATIONS_V1 = 210_000;
export const PBKDF2_ITERATIONS_V2 = 600_000; // OWASP recommendation for PBKDF2-HMAC-SHA256
export const DEFAULT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V2;

const GUARDIAN_KEY_CHECK_VALUE = 'GUARDIAN_VAULT_KEY_CHECK_V3';
const LEGACY_KEY_CHECK_VALUE = ['BHA', 'RATH_VAULT_VERIFIED_V1'].join('');
const LEGACY_EXPORT_PREFIX = ['BHA', 'RATH_VAULT_ENCRYPTED_V'].join('');

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const WEAK_PINS = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '7890',
  '0123',
  '4321',
  '9876',
  '8765',
  '7654',
  '6543',
  '5432',
  '3210',
  '0987',
  '1212',
  '2121',
  '1122',
  '2211',
  '1010',
  '2020',
  '2580',
  '0852',
]);

export function validatePinFormatAndStrength(pin: string): {
  valid: boolean;
  error?: string;
} {
  if (!/^\d{4}$/.test(pin)) {
    return { valid: false, error: 'PIN must be exactly 4 digits.' };
  }
  if (WEAK_PINS.has(pin)) {
    return {
      valid: false,
      error:
        'This PIN is too easy to guess (e.g. 0000, 1111, 1234, 4321). Choose a stronger 4-digit PIN.',
    };
  }
  return { valid: true };
}

export function isWeakPin(pin: string): boolean {
  return !validatePinFormatAndStrength(pin).valid;
}

/**
 * Generates a 24-character Crockford Base32 recovery key (120 bits of entropy)
 * formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.
 */
export function generateRecoveryKey(): string {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const groups: string[] = [];
  for (let g = 0; g < 6; g++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) {
      const idx = randomBytes[g * 4 + i] & 31;
      chunk += CROCKFORD_ALPHABET[idx];
    }
    groups.push(chunk);
  }
  return groups.join('-');
}

/**
 * Normalizes user-entered Crockford Base32 recovery key into XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.
 */
export function normalizeRecoveryKey(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (cleaned.length !== 24) {
    return cleaned;
  }
  const parts: string[] = [];
  for (let i = 0; i < 24; i += 4) {
    parts.push(cleaned.slice(i, i + 4));
  }
  return parts.join('-');
}

export function isValidRecoveryKeyFormat(raw: string): boolean {
  const normalized = normalizeRecoveryKey(raw);
  return /^[0-9A-HJ-KM-NP-TV-Z]{4}(-[0-9A-HJ-KM-NP-TV-Z]{4}){5}$/.test(
    normalized
  );
}

export function resolveIterationsForVersion(
  version?: number,
  explicitIterations?: number
): number {
  if (typeof explicitIterations === 'number' && explicitIterations >= 10_000) {
    return explicitIterations;
  }
  if (!version || version === VAULT_FORMAT_VERSION_V1) {
    return PBKDF2_ITERATIONS_V1;
  }
  return PBKDF2_ITERATIONS_V2;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export function generateIv(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Generates a random 256-bit Data Encryption Key (DEK) for envelope encryption.
 */
export async function generateDataEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportRawKeyBytes(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function importRawDekBytes(rawBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawBytes.buffer.slice(
      rawBytes.byteOffset,
      rawBytes.byteOffset + rawBytes.byteLength
    ) as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveMasterKey(
  secret: string,
  saltBase64: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
  extractable = false
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBytes = base64ToBytes(saltBase64);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer.slice(
        saltBytes.byteOffset,
        saltBytes.byteOffset + saltBytes.byteLength
      ) as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(
  key: CryptoKey,
  plainBytes: Uint8Array
): Promise<{ iv: string; ciphertext: string }> {
  const iv = generateIv();
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(
        iv.byteOffset,
        iv.byteOffset + iv.byteLength
      ) as ArrayBuffer,
    },
    key,
    plainBytes.buffer.slice(
      plainBytes.byteOffset,
      plainBytes.byteOffset + plainBytes.byteLength
    ) as ArrayBuffer
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptBytes(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<Uint8Array> {
  const iv = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(ciphertextBase64);
  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer.slice(
        iv.byteOffset,
        iv.byteOffset + iv.byteLength
      ) as ArrayBuffer,
    },
    key,
    cipherBytes.buffer.slice(
      cipherBytes.byteOffset,
      cipherBytes.byteOffset + cipherBytes.byteLength
    ) as ArrayBuffer
  );
  return new Uint8Array(plainBuffer);
}

export async function encryptJson<T>(
  key: CryptoKey,
  payload: T
): Promise<{ iv: string; ciphertext: string }> {
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(payload));
  return encryptBytes(key, encoded);
}

export async function decryptJson<T>(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<T> {
  const plainBytes = await decryptBytes(key, ivBase64, ciphertextBase64);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plainBytes)) as T;
}

export async function createKeyCheckVerifier(
  key: CryptoKey
): Promise<{ verifierIv: string; verifierCipher: string }> {
  const { iv, ciphertext } = await encryptJson(key, GUARDIAN_KEY_CHECK_VALUE);
  return { verifierIv: iv, verifierCipher: ciphertext };
}

export const createPasswordVerifier = createKeyCheckVerifier;

export async function verifyKeyCheck(
  key: CryptoKey,
  verifierIv: string,
  verifierCipher: string
): Promise<boolean> {
  try {
    const result = await decryptJson<string>(key, verifierIv, verifierCipher);
    return (
      result === GUARDIAN_KEY_CHECK_VALUE || result === LEGACY_KEY_CHECK_VALUE
    );
  } catch {
    return false;
  }
}

export const verifyMasterKey = verifyKeyCheck;

/**
 * Wraps (encrypts) the 256-bit DEK using a secret (4-digit PIN, Master Password, or Recovery Key)
 * via PBKDF2-SHA256 with 600,000 iterations and a fresh 16-byte random salt.
 */
export async function wrapDekWithSecret(
  dek: CryptoKey,
  secret: string,
  iterations: number = PBKDF2_ITERATIONS_V2
): Promise<WrappedKeySlot> {
  const salt = generateSalt();
  const kek = await deriveMasterKey(secret, salt, iterations);
  const rawDek = await exportRawKeyBytes(dek);
  const { iv: wrappedDekIv, ciphertext: wrappedDekCipher } = await encryptBytes(
    kek,
    rawDek
  );
  const { verifierIv, verifierCipher } = await createKeyCheckVerifier(kek);

  return {
    salt,
    iterations,
    wrappedDekIv,
    wrappedDekCipher,
    verifierIv,
    verifierCipher,
  };
}

/**
 * Unwraps (decrypts) the 256-bit DEK using a secret and its stored WrappedKeySlot.
 * Verifies the key-check value first so wrong credentials cleanly return null without corrupting data.
 */
export async function unwrapDekWithSecret(
  slot: WrappedKeySlot,
  secret: string
): Promise<CryptoKey | null> {
  try {
    const iterations = resolveIterationsForVersion(
      VAULT_FORMAT_VERSION_V3,
      slot.iterations
    );
    const kek = await deriveMasterKey(secret, slot.salt, iterations);
    const ok = await verifyKeyCheck(kek, slot.verifierIv, slot.verifierCipher);
    if (!ok) {
      return null;
    }
    const rawDek = await decryptBytes(
      kek,
      slot.wrappedDekIv,
      slot.wrappedDekCipher
    );
    return await importRawDekBytes(rawDek);
  } catch {
    return null;
  }
}

export async function encryptVaultFileWithPassword(
  payload: DecryptedVaultPayload,
  password: string
): Promise<EncryptedVaultFile> {
  const salt = generateSalt();
  const iterations = PBKDF2_ITERATIONS_V2;
  const key = await deriveMasterKey(password, salt, iterations);
  const { iv, ciphertext } = await encryptJson(key, {
    ...payload,
    version: CURRENT_VAULT_FORMAT_VERSION,
  });
  return {
    header: 'guardian-vault',
    version: CURRENT_VAULT_FORMAT_VERSION,
    iterations,
    exportedAt: new Date().toISOString(),
    salt,
    iv,
    ciphertext,
  };
}

export function isEncryptedVaultFileObject(
  obj: unknown
): obj is EncryptedVaultFile {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  if (rec.header === 'guardian-vault') return true;
  if (
    typeof rec.magic === 'string' &&
    (rec.magic === `${LEGACY_EXPORT_PREFIX}1` ||
      rec.magic === `${LEGACY_EXPORT_PREFIX}2`)
  ) {
    return true;
  }
  return false;
}

export async function decryptVaultFileWithPassword(
  fileObj: EncryptedVaultFile,
  password: string
): Promise<DecryptedVaultPayload> {
  if (!isEncryptedVaultFileObject(fileObj)) {
    throw new Error('Invalid .vault file header.');
  }
  const iterationsToTry = resolveIterationsForVersion(
    fileObj.version,
    fileObj.iterations
  );
  try {
    const key = await deriveMasterKey(password, fileObj.salt, iterationsToTry);
    return await decryptJson<DecryptedVaultPayload>(
      key,
      fileObj.iv,
      fileObj.ciphertext
    );
  } catch {
    const fallbackIterations =
      iterationsToTry === PBKDF2_ITERATIONS_V2
        ? PBKDF2_ITERATIONS_V1
        : PBKDF2_ITERATIONS_V2;
    const fallbackKey = await deriveMasterKey(
      password,
      fileObj.salt,
      fallbackIterations
    );
    return decryptJson<DecryptedVaultPayload>(
      fallbackKey,
      fileObj.iv,
      fileObj.ciphertext
    );
  }
}
