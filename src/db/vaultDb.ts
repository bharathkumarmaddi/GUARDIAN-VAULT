import Dexie, { type Table } from 'dexie';
import {
  AutoLockMinutes,
  EncryptedRecord,
  VaultCollection,
  VaultItem,
  VaultMeta,
  VaultTag,
} from '../types/vault';
import {
  CURRENT_VAULT_FORMAT_VERSION,
  PBKDF2_ITERATIONS_V2,
  createKeyCheckVerifier,
  decryptJson,
  deriveMasterKey,
  encryptJson,
  generateDataEncryptionKey,
  generateRecoveryKey,
  normalizeRecoveryKey,
  resolveIterationsForVersion,
  unwrapDekWithSecret,
  validatePinFormatAndStrength,
  verifyKeyCheck,
  wrapDekWithSecret,
} from '../crypto/webCrypto';
import { DEFAULT_COLLECTIONS, DEFAULT_TAGS } from '../constants/sections';
import {
  MAX_PIN_ATTEMPTS,
  MIN_SETUP_PASSWORD_LENGTH,
} from '../utils/vaultLogic';

export const GUARDIAN_DB_NAME = 'GuardianVaultDB';
export const LEGACY_DB_NAME = ['Bha', 'raths', 'VaultDB'].join('');

export class GuardianVaultDatabase extends Dexie {
  meta!: Table<VaultMeta, string>;
  items!: Table<EncryptedRecord, string>;
  collections!: Table<EncryptedRecord, string>;
  tags!: Table<EncryptedRecord, string>;

  constructor(name: string = GUARDIAN_DB_NAME) {
    super(name);
    this.version(1).stores({
      meta: 'id',
      items: 'id, updatedAt',
      collections: 'id, updatedAt',
      tags: 'id, updatedAt',
    });
  }
}

export const db = new GuardianVaultDatabase(GUARDIAN_DB_NAME);

/**
 * On first launch, if the legacy database exists and GuardianVaultDB is empty,
 * copies all tables into GuardianVaultDB once and deletes the legacy database.
 */
export async function migrateLegacyDatabaseIfNeeded(): Promise<boolean> {
  try {
    const existingGuardianMeta = await db.meta.get('meta');
    if (existingGuardianMeta) {
      return false;
    }

    const exists = await Dexie.exists(LEGACY_DB_NAME);
    if (!exists) {
      return false;
    }

    const legacyDb = new GuardianVaultDatabase(LEGACY_DB_NAME);
    await legacyDb.open();

    const [legacyMeta, legacyItems, legacyCols, legacyTags] = await Promise.all([
      legacyDb.meta.get('meta'),
      legacyDb.items.toArray(),
      legacyDb.collections.toArray(),
      legacyDb.tags.toArray(),
    ]);

    await legacyDb.close();

    if (!legacyMeta) {
      await Dexie.delete(LEGACY_DB_NAME);
      return false;
    }

    await db.transaction(
      'rw',
      db.meta,
      db.items,
      db.collections,
      db.tags,
      async () => {
        await db.meta.put(legacyMeta);
        if (legacyItems.length) await db.items.bulkPut(legacyItems);
        if (legacyCols.length) await db.collections.bulkPut(legacyCols);
        if (legacyTags.length) await db.tags.bulkPut(legacyTags);
      }
    );

    await Dexie.delete(LEGACY_DB_NAME);
    return true;
  } catch {
    return false;
  }
}

export async function getVaultMeta(): Promise<VaultMeta | undefined> {
  await migrateLegacyDatabaseIfNeeded();
  return db.meta.get('meta');
}

export function isLegacyVaultMeta(meta?: VaultMeta | null): boolean {
  if (!meta) return false;
  return !meta.passwordSlot && Boolean(meta.salt && meta.verifierCipher);
}

export function needsEnvelopeCompletion(meta?: VaultMeta | null): boolean {
  if (!meta) return false;
  return !meta.pinSlot || !meta.recoverySlot;
}

/**
 * Initializes a brand-new Guardian Vault using Envelope Encryption:
 * - Random 256-bit AES-GCM Data Encryption Key (DEK)
 * - 3 independent PBKDF2-SHA256 (600,000 iterations) wrapped key slots:
 *   1. 4-digit PIN
 *   2. Master password (min 8 chars)
 *   3. Recovery key (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
 */
export async function setupGuardianVault(
  pin: string,
  password: string,
  providedRecoveryKey?: string
): Promise<{
  key: CryptoKey;
  meta: VaultMeta;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
  recoveryKey: string;
}> {
  const pinCheck = validatePinFormatAndStrength(pin);
  if (!pinCheck.valid) {
    throw new Error(pinCheck.error || 'Invalid 4-digit PIN.');
  }
  if (!password || password.length < MIN_SETUP_PASSWORD_LENGTH) {
    throw new Error(
      `Master password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
    );
  }

  const recoveryKey = providedRecoveryKey
    ? normalizeRecoveryKey(providedRecoveryKey)
    : generateRecoveryKey();

  const dek = await generateDataEncryptionKey();

  const [pinSlot, passwordSlot, recoverySlot, dekVerifier] = await Promise.all([
    wrapDekWithSecret(dek, pin, PBKDF2_ITERATIONS_V2),
    wrapDekWithSecret(dek, password, PBKDF2_ITERATIONS_V2),
    wrapDekWithSecret(dek, recoveryKey, PBKDF2_ITERATIONS_V2),
    createKeyCheckVerifier(dek),
  ]);

  const meta: VaultMeta = {
    id: 'meta',
    version: CURRENT_VAULT_FORMAT_VERSION,
    iterations: PBKDF2_ITERATIONS_V2,
    pinSlot,
    passwordSlot,
    recoverySlot,
    dekVerifierIv: dekVerifier.verifierIv,
    dekVerifierCipher: dekVerifier.verifierCipher,
    failedPinAttempts: 0,
    pinLockedOut: false,
    autoLockMinutes: 10,
    theme: 'dark',
    createdAt: new Date().toISOString(),
  };

  const initialCollections = DEFAULT_COLLECTIONS;
  const initialTags = DEFAULT_TAGS;

  const encryptedCollections: EncryptedRecord[] = await Promise.all(
    initialCollections.map(async (col) => {
      const { iv, ciphertext } = await encryptJson(dek, col);
      return { id: col.id, iv, ciphertext, updatedAt: col.createdAt };
    })
  );

  const encryptedTags: EncryptedRecord[] = await Promise.all(
    initialTags.map(async (tag) => {
      const { iv, ciphertext } = await encryptJson(dek, tag);
      return {
        id: tag.id,
        iv,
        ciphertext,
        updatedAt: new Date().toISOString(),
      };
    })
  );

  await db.transaction(
    'rw',
    db.meta,
    db.items,
    db.collections,
    db.tags,
    async () => {
      await db.meta.clear();
      await db.items.clear();
      await db.collections.clear();
      await db.tags.clear();

      await db.meta.put(meta);
      if (encryptedCollections.length) {
        await db.collections.bulkPut(encryptedCollections);
      }
      if (encryptedTags.length) {
        await db.tags.bulkPut(encryptedTags);
      }
    }
  );

  return {
    key: dek,
    meta,
    items: [],
    collections: initialCollections,
    tags: initialTags,
    recoveryKey,
  };
}

async function decryptAllRecordsWithDek(dek: CryptoKey): Promise<{
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
}> {
  const [rawItems, rawCols, rawTags] = await Promise.all([
    db.items.toArray(),
    db.collections.toArray(),
    db.tags.toArray(),
  ]);

  const items = await Promise.all(
    rawItems.map((rec) => decryptJson<VaultItem>(dek, rec.iv, rec.ciphertext))
  );
  const decodedCollections = await Promise.all(
    rawCols.map((rec) =>
      decryptJson<VaultCollection>(dek, rec.iv, rec.ciphertext)
    )
  );
  const decodedTags = await Promise.all(
    rawTags.map((rec) => decryptJson<VaultTag>(dek, rec.iv, rec.ciphertext))
  );

  return {
    items,
    collections: decodedCollections.length
      ? decodedCollections
      : DEFAULT_COLLECTIONS,
    tags: decodedTags.length ? decodedTags : DEFAULT_TAGS,
  };
}

/**
 * Unlocks the vault using the 4-digit PIN.
 * Enforces the 5-wrong-attempt lockout and tracks failed attempts.
 */
export async function unlockVaultWithPin(pin: string): Promise<{
  key: CryptoKey;
  meta: VaultMeta;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
}> {
  const meta = await getVaultMeta();
  if (!meta) {
    throw new Error('Vault is not initialized.');
  }

  const currentFailed = meta.failedPinAttempts || 0;
  if (meta.pinLockedOut || currentFailed >= MAX_PIN_ATTEMPTS) {
    throw new Error(
      'PIN is disabled after 5 wrong attempts. Please unlock with your master password.'
    );
  }

  if (!meta.pinSlot) {
    throw new Error(
      'PIN is not set on this vault yet. Please unlock with your master password.'
    );
  }

  const dek = await unwrapDekWithSecret(meta.pinSlot, pin);
  if (!dek) {
    const nextFailed = currentFailed + 1;
    const lockedOut = nextFailed >= MAX_PIN_ATTEMPTS;
    const updatedMeta: VaultMeta = {
      ...meta,
      failedPinAttempts: nextFailed,
      pinLockedOut: lockedOut,
      lastFailedPinAt: Date.now(),
    };
    await db.meta.put(updatedMeta);
    if (lockedOut) {
      throw new Error(
        'Wrong PIN. PIN is now disabled after 5 wrong attempts — use your master password.'
      );
    }
    throw new Error('Wrong PIN');
  }

  let updatedMeta = meta;
  if (currentFailed > 0 || meta.pinLockedOut) {
    updatedMeta = {
      ...meta,
      failedPinAttempts: 0,
      pinLockedOut: false,
      lastFailedPinAt: undefined,
    };
    await db.meta.put(updatedMeta);
  }

  const { items, collections, tags } = await decryptAllRecordsWithDek(dek);
  return {
    key: dek,
    meta: updatedMeta,
    items,
    collections,
    tags,
  };
}

/**
 * Unlocks the vault with the master password.
 * - If PIN was locked out after 5 wrong attempts, entering the correct master password clears the lockout.
 * - If the vault uses the legacy v1/v2 password-derived key format (no DEK), transparently migrates
 *   all records to a new 256-bit DEK and flags `needsMigrationSetup: true` so the user sets a PIN
 *   and receives a one-time recovery key.
 */
export async function unlockVaultWithPassword(password: string): Promise<{
  key: CryptoKey;
  meta: VaultMeta;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
  needsMigrationSetup: boolean;
}> {
  const meta = await getVaultMeta();
  if (!meta) {
    throw new Error('Vault is not initialized.');
  }

  // Case 1: Envelope v3 vault
  if (meta.passwordSlot) {
    const dek = await unwrapDekWithSecret(meta.passwordSlot, password);
    if (!dek) {
      throw new Error('Wrong password');
    }

    const updatedMeta: VaultMeta = {
      ...meta,
      failedPinAttempts: 0,
      pinLockedOut: false,
      lastFailedPinAt: undefined,
    };
    await db.meta.put(updatedMeta);

    const { items, collections, tags } = await decryptAllRecordsWithDek(dek);
    return {
      key: dek,
      meta: updatedMeta,
      items,
      collections,
      tags,
      needsMigrationSetup: !meta.pinSlot || !meta.recoverySlot,
    };
  }

  // Case 2: Legacy v1/v2 vault (password-derived key at 210,000 or 600,000 iterations, no DEK)
  if (!meta.salt || !meta.verifierIv || !meta.verifierCipher) {
    throw new Error('Corrupted vault metadata.');
  }

  const storedIterations = resolveIterationsForVersion(
    meta.version,
    meta.iterations
  );
  const legacyKey = await deriveMasterKey(
    password,
    meta.salt,
    storedIterations
  );
  const ok = await verifyKeyCheck(
    legacyKey,
    meta.verifierIv,
    meta.verifierCipher
  );
  if (!ok) {
    throw new Error('Wrong password');
  }

  const { items, collections, tags } =
    await decryptAllRecordsWithDek(legacyKey);

  // Convert to Envelope Encryption (256-bit DEK)
  const dek = await generateDataEncryptionKey();
  const [passwordSlot, dekVerifier] = await Promise.all([
    wrapDekWithSecret(dek, password, PBKDF2_ITERATIONS_V2),
    createKeyCheckVerifier(dek),
  ]);

  const reEncryptedItems = await Promise.all(
    items.map(async (item) => {
      const { iv, ciphertext } = await encryptJson(dek, item);
      return { id: item.id, iv, ciphertext, updatedAt: item.updatedAt };
    })
  );

  const reEncryptedCols = await Promise.all(
    collections.map(async (col) => {
      const { iv, ciphertext } = await encryptJson(dek, col);
      return { id: col.id, iv, ciphertext, updatedAt: col.createdAt };
    })
  );

  const reEncryptedTags = await Promise.all(
    tags.map(async (tag) => {
      const { iv, ciphertext } = await encryptJson(dek, tag);
      return {
        id: tag.id,
        iv,
        ciphertext,
        updatedAt: new Date().toISOString(),
      };
    })
  );

  const migratedMeta: VaultMeta = {
    id: 'meta',
    version: CURRENT_VAULT_FORMAT_VERSION,
    iterations: PBKDF2_ITERATIONS_V2,
    passwordSlot,
    dekVerifierIv: dekVerifier.verifierIv,
    dekVerifierCipher: dekVerifier.verifierCipher,
    failedPinAttempts: 0,
    pinLockedOut: false,
    autoLockMinutes: meta.autoLockMinutes ?? 10,
    theme: meta.theme || 'dark',
    lastBackupAt: meta.lastBackupAt,
    createdAt: meta.createdAt || new Date().toISOString(),
  };

  await db.transaction(
    'rw',
    db.meta,
    db.items,
    db.collections,
    db.tags,
    async () => {
      await db.meta.put(migratedMeta);
      await db.items.clear();
      await db.collections.clear();
      await db.tags.clear();
      if (reEncryptedItems.length) await db.items.bulkPut(reEncryptedItems);
      if (reEncryptedCols.length) await db.collections.bulkPut(reEncryptedCols);
      if (reEncryptedTags.length) await db.tags.bulkPut(reEncryptedTags);
    }
  );

  return {
    key: dek,
    meta: migratedMeta,
    items,
    collections,
    tags,
    needsMigrationSetup: true,
  };
}

/**
 * Completes legacy vault migration by wrapping the existing DEK with the user's new 4-digit PIN
 * and generating a one-time recovery key.
 */
export async function completeMigrationPinAndRecovery(
  dek: CryptoKey,
  pin: string,
  providedRecoveryKey?: string
): Promise<{
  meta: VaultMeta;
  recoveryKey: string;
}> {
  const pinCheck = validatePinFormatAndStrength(pin);
  if (!pinCheck.valid) {
    throw new Error(pinCheck.error || 'Invalid 4-digit PIN.');
  }

  const meta = await getVaultMeta();
  if (!meta) {
    throw new Error('Vault metadata not found.');
  }

  const recoveryKey = providedRecoveryKey
    ? normalizeRecoveryKey(providedRecoveryKey)
    : generateRecoveryKey();

  const [pinSlot, recoverySlot] = await Promise.all([
    wrapDekWithSecret(dek, pin, PBKDF2_ITERATIONS_V2),
    wrapDekWithSecret(dek, recoveryKey, PBKDF2_ITERATIONS_V2),
  ]);

  const updatedMeta: VaultMeta = {
    ...meta,
    version: CURRENT_VAULT_FORMAT_VERSION,
    pinSlot,
    recoverySlot,
    failedPinAttempts: 0,
    pinLockedOut: false,
  };

  await db.meta.put(updatedMeta);
  return { meta: updatedMeta, recoveryKey };
}

/**
 * "Forgot PIN?" flow:
 * Verifies the master password, then wraps the DEK with the new 4-digit PIN and unlocks the vault.
 */
export async function resetPinWithMasterPassword(
  password: string,
  newPin: string
): Promise<{
  key: CryptoKey;
  meta: VaultMeta;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
}> {
  const pinCheck = validatePinFormatAndStrength(newPin);
  if (!pinCheck.valid) {
    throw new Error(pinCheck.error || 'Invalid 4-digit PIN.');
  }

  const meta = await getVaultMeta();
  if (!meta || !meta.passwordSlot) {
    throw new Error('Vault is not initialized.');
  }

  const dek = await unwrapDekWithSecret(meta.passwordSlot, password);
  if (!dek) {
    throw new Error('Wrong password');
  }

  const pinSlot = await wrapDekWithSecret(dek, newPin, PBKDF2_ITERATIONS_V2);
  const updatedMeta: VaultMeta = {
    ...meta,
    pinSlot,
    failedPinAttempts: 0,
    pinLockedOut: false,
    lastFailedPinAt: undefined,
  };
  await db.meta.put(updatedMeta);

  const { items, collections, tags } = await decryptAllRecordsWithDek(dek);
  return {
    key: dek,
    meta: updatedMeta,
    items,
    collections,
    tags,
  };
}

/**
 * "Forgot password?" flow:
 * Verifies the recovery key, unwraps the DEK, re-wraps the DEK with a new master password,
 * a new 4-digit PIN, and a brand-new recovery key (invalidating the old recovery key).
 * All encrypted vault items remain untouched and intact.
 */
export async function resetCredentialsWithRecoveryKey(
  recoveryKeyInput: string,
  newPassword: string,
  newPin: string,
  providedNewRecoveryKey?: string
): Promise<{
  key: CryptoKey;
  meta: VaultMeta;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
  newRecoveryKey: string;
}> {
  const pinCheck = validatePinFormatAndStrength(newPin);
  if (!pinCheck.valid) {
    throw new Error(pinCheck.error || 'Invalid 4-digit PIN.');
  }
  if (!newPassword || newPassword.length < MIN_SETUP_PASSWORD_LENGTH) {
    throw new Error(
      `Master password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
    );
  }

  const meta = await getVaultMeta();
  if (!meta || !meta.recoverySlot) {
    throw new Error('Vault recovery slot not found.');
  }

  const normalizedInput = normalizeRecoveryKey(recoveryKeyInput);
  const dek = await unwrapDekWithSecret(meta.recoverySlot, normalizedInput);
  if (!dek) {
    throw new Error('Invalid recovery key');
  }

  const newRecoveryKey = providedNewRecoveryKey
    ? normalizeRecoveryKey(providedNewRecoveryKey)
    : generateRecoveryKey();

  const [pinSlot, passwordSlot, recoverySlot] = await Promise.all([
    wrapDekWithSecret(dek, newPin, PBKDF2_ITERATIONS_V2),
    wrapDekWithSecret(dek, newPassword, PBKDF2_ITERATIONS_V2),
    wrapDekWithSecret(dek, newRecoveryKey, PBKDF2_ITERATIONS_V2),
  ]);

  const updatedMeta: VaultMeta = {
    ...meta,
    version: CURRENT_VAULT_FORMAT_VERSION,
    pinSlot,
    passwordSlot,
    recoverySlot,
    failedPinAttempts: 0,
    pinLockedOut: false,
    lastFailedPinAt: undefined,
  };

  await db.meta.put(updatedMeta);

  const { items, collections, tags } = await decryptAllRecordsWithDek(dek);
  return {
    key: dek,
    meta: updatedMeta,
    items,
    collections,
    tags,
    newRecoveryKey,
  };
}

/**
 * Settings -> Security: Change 4-digit PIN (re-wraps DEK only).
 */
export async function changeVaultPin(
  dek: CryptoKey,
  newPin: string
): Promise<VaultMeta> {
  const pinCheck = validatePinFormatAndStrength(newPin);
  if (!pinCheck.valid) {
    throw new Error(pinCheck.error || 'Invalid 4-digit PIN.');
  }
  const currentMeta = await getVaultMeta();
  if (!currentMeta) throw new Error('Vault metadata not found.');

  const pinSlot = await wrapDekWithSecret(dek, newPin, PBKDF2_ITERATIONS_V2);
  const updatedMeta: VaultMeta = {
    ...currentMeta,
    pinSlot,
    failedPinAttempts: 0,
    pinLockedOut: false,
    lastFailedPinAt: undefined,
  };
  await db.meta.put(updatedMeta);
  return updatedMeta;
}

/**
 * Settings -> Security: Change master password (re-wraps DEK only).
 */
export async function changeVaultMasterPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  if (!newPassword || newPassword.length < MIN_SETUP_PASSWORD_LENGTH) {
    throw new Error(
      `New password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
    );
  }
  const currentMeta = await getVaultMeta();
  if (!currentMeta || !currentMeta.passwordSlot) {
    throw new Error('Vault metadata not found.');
  }

  const dek = await unwrapDekWithSecret(
    currentMeta.passwordSlot,
    currentPassword
  );
  if (!dek) {
    throw new Error('Wrong password');
  }

  const passwordSlot = await wrapDekWithSecret(
    dek,
    newPassword,
    PBKDF2_ITERATIONS_V2
  );
  const updatedMeta: VaultMeta = {
    ...currentMeta,
    passwordSlot,
  };
  await db.meta.put(updatedMeta);
  return { key: dek, meta: updatedMeta };
}

/**
 * Settings -> Security: Regenerate recovery key (re-wraps DEK with a fresh recovery key; old key stops working).
 */
export async function regenerateVaultRecoveryKey(
  currentPassword: string
): Promise<{ meta: VaultMeta; recoveryKey: string }> {
  const currentMeta = await getVaultMeta();
  if (!currentMeta || !currentMeta.passwordSlot) {
    throw new Error('Vault metadata not found.');
  }

  const dek = await unwrapDekWithSecret(
    currentMeta.passwordSlot,
    currentPassword
  );
  if (!dek) {
    throw new Error('Wrong password');
  }

  const recoveryKey = generateRecoveryKey();
  const recoverySlot = await wrapDekWithSecret(
    dek,
    recoveryKey,
    PBKDF2_ITERATIONS_V2
  );
  const updatedMeta: VaultMeta = {
    ...currentMeta,
    recoverySlot,
  };
  await db.meta.put(updatedMeta);
  return { meta: updatedMeta, recoveryKey };
}

export async function updateAutoLockMinutes(
  minutes: AutoLockMinutes
): Promise<VaultMeta | undefined> {
  return updateVaultMeta({ autoLockMinutes: minutes });
}

export async function saveEncryptedItem(
  key: CryptoKey,
  item: VaultItem
): Promise<void> {
  const { iv, ciphertext } = await encryptJson(key, item);
  await db.items.put({
    id: item.id,
    iv,
    ciphertext,
    updatedAt: item.updatedAt,
  });
}

export async function saveEncryptedItemsBulk(
  key: CryptoKey,
  items: VaultItem[]
): Promise<void> {
  const records = await Promise.all(
    items.map(async (item) => {
      const { iv, ciphertext } = await encryptJson(key, item);
      return { id: item.id, iv, ciphertext, updatedAt: item.updatedAt };
    })
  );
  await db.items.bulkPut(records);
}

export async function deleteEncryptedItem(id: string): Promise<void> {
  await db.items.delete(id);
}

export async function saveEncryptedCollection(
  key: CryptoKey,
  col: VaultCollection
): Promise<void> {
  const { iv, ciphertext } = await encryptJson(key, col);
  await db.collections.put({
    id: col.id,
    iv,
    ciphertext,
    updatedAt: col.createdAt,
  });
}

export async function deleteEncryptedCollection(id: string): Promise<void> {
  await db.collections.delete(id);
}

export async function saveEncryptedTag(
  key: CryptoKey,
  tag: VaultTag
): Promise<void> {
  const { iv, ciphertext } = await encryptJson(key, tag);
  await db.tags.put({
    id: tag.id,
    iv,
    ciphertext,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteEncryptedTag(id: string): Promise<void> {
  await db.tags.delete(id);
}

export async function updateVaultMeta(
  patch: Partial<Omit<VaultMeta, 'id'>>
): Promise<VaultMeta | undefined> {
  const current = await getVaultMeta();
  if (!current) return undefined;
  const updated: VaultMeta = { ...current, ...patch };
  await db.meta.put(updated);
  return updated;
}

/**
 * Wipes only the GuardianVaultDB database.
 */
export async function wipeEntireVault(): Promise<void> {
  await db.transaction(
    'rw',
    db.meta,
    db.items,
    db.collections,
    db.tags,
    async () => {
      await db.meta.clear();
      await db.items.clear();
      await db.collections.clear();
      await db.tags.clear();
    }
  );
}
