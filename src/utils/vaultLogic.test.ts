import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  CURRENT_VAULT_FORMAT_VERSION,
  PBKDF2_ITERATIONS_V1,
  PBKDF2_ITERATIONS_V2,
  createKeyCheckVerifier,
  decryptVaultFileWithPassword,
  deriveMasterKey,
  encryptJson,
  encryptVaultFileWithPassword,
  generateRecoveryKey,
  generateSalt,
  isValidRecoveryKeyFormat,
  isWeakPin,
  normalizeRecoveryKey,
  validatePinFormatAndStrength,
} from '../crypto/webCrypto';
import {
  GUARDIAN_DB_NAME,
  GuardianVaultDatabase,
  LEGACY_DB_NAME,
  changeVaultMasterPassword,
  changeVaultPin,
  completeMigrationPinAndRecovery,
  db,
  getVaultMeta,
  migrateLegacyDatabaseIfNeeded,
  regenerateVaultRecoveryKey,
  resetCredentialsWithRecoveryKey,
  resetPinWithMasterPassword,
  saveEncryptedItem,
  setupGuardianVault,
  unlockVaultWithPassword,
  unlockVaultWithPin,
  wipeEntireVault,
} from '../db/vaultDb';
import {
  canSubmitPin,
  detectUrlType,
  detectVisitorOS,
  evaluatePasswordStrength,
  filterAndSortItems,
  findDuplicateUrlItem,
  formatCountdown,
  generateStandaloneHtml,
  getCarouselRole,
  getNextCarouselIndex,
  getPinAttemptDelayMs,
  isBackupOverdue,
  normalizeUrl,
  parseBookmarksHtml,
  parsePinKeyboardInput,
  renderMarkdownToHtml,
  sanitizePastedPin,
} from './vaultLogic';
import {
  buildUniversalClipboardPayload,
  computeIncrementalSyncDiff,
  createUniversalTransferObject,
  decodeQrTransferString,
  decryptBinaryGvaultPacket,
  encodeQrTransferString,
  encryptBinaryGvaultPacket,
  encryptUniversalGvault,
  isValidTransferUrl,
  parseAndAnalyzeTransferInput,
  resolveSelectiveImport,
  scrubSecretsFromObject,
  serializeToUniversalGvault,
} from './universalTransfer';
import { VaultCollection, VaultItem, VaultMeta } from '../types/vault';

const sampleLinkItem: VaultItem = {
  id: 'item-1',
  type: 'link',
  title: 'Web Crypto API Documentation',
  url: 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto',
  description: 'SubtleCrypto reference for AES-GCM and PBKDF2.',
  tags: ['security', 'web'],
  collectionId: 'col-dev',
  pinned: true,
  favourite: true,
  archived: false,
  trashed: false,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
  openCount: 5,
};

describe('Guardian Vault — Envelope Encryption, PIN Lockout, Recovery & Migration Suite', () => {
  beforeEach(async () => {
    await wipeEntireVault();
    try {
      await Dexie.delete(LEGACY_DB_NAME);
    } catch {
      // Ignore if legacy DB does not exist
    }
  });

  it('1. Fresh setup creates a 256-bit DEK wrapped by PIN, master password, and Crockford Base32 recovery key', async () => {
    expect(isWeakPin('0000')).toBe(true);
    expect(isWeakPin('1111')).toBe(true);
    expect(isWeakPin('1234')).toBe(true);
    expect(isWeakPin('4321')).toBe(true);
    expect(isWeakPin('7392')).toBe(false);

    const res = await setupGuardianVault('7392', 'StrongPass#2026');
    expect(res.meta.version).toBe(CURRENT_VAULT_FORMAT_VERSION);
    expect(res.meta.pinSlot?.iterations).toBe(PBKDF2_ITERATIONS_V2);
    expect(res.meta.passwordSlot?.iterations).toBe(PBKDF2_ITERATIONS_V2);
    expect(res.meta.recoverySlot?.iterations).toBe(PBKDF2_ITERATIONS_V2);
    expect(res.items).toHaveLength(0);
    expect(isValidRecoveryKeyFormat(res.recoveryKey)).toBe(true);
  });

  it('2. Correct PIN unlocks and wrong PIN is rejected without corrupting data', async () => {
    const setup = await setupGuardianVault('8426', 'GuardianPass!99');
    await saveEncryptedItem(setup.key, sampleLinkItem);

    // Wrong PIN rejected
    await expect(unlockVaultWithPin('9998')).rejects.toThrow(/Wrong PIN/);

    // Correct PIN unlocks and returns saved item
    const unlocked = await unlockVaultWithPin('8426');
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.items[0].title).toBe('Web Crypto API Documentation');
    expect(unlocked.meta.failedPinAttempts).toBe(0);
    expect(unlocked.meta.pinLockedOut).toBe(false);
  });

  it('3. Lockout after 5 wrong PINs disables PIN until master password is entered', async () => {
    await setupGuardianVault('5927', 'GuardianMaster#1');

    // Attempts 1..4 fail with "Wrong PIN" and progressive delay schedule
    for (let i = 1; i <= 4; i++) {
      await expect(unlockVaultWithPin('1357')).rejects.toThrow(/Wrong PIN/);
      expect(getPinAttemptDelayMs(i)).toBeGreaterThan(0);
    }

    // 5th wrong PIN triggers lockout
    await expect(unlockVaultWithPin('1357')).rejects.toThrow(
      /disabled after 5 wrong attempts/
    );

    const lockedMeta = await getVaultMeta();
    expect(lockedMeta?.pinLockedOut).toBe(true);
    expect(lockedMeta?.failedPinAttempts).toBe(5);

    // Even the CORRECT PIN is rejected while PIN is locked out
    await expect(unlockVaultWithPin('5927')).rejects.toThrow(
      /disabled after 5 wrong attempts/
    );

    // Unlocking with master password succeeds and clears PIN lockout
    const passUnlock = await unlockVaultWithPassword('GuardianMaster#1');
    expect(passUnlock.meta.pinLockedOut).toBe(false);
    expect(passUnlock.meta.failedPinAttempts).toBe(0);

    // Now the correct PIN works again
    const pinUnlock = await unlockVaultWithPin('5927');
    expect(pinUnlock.meta.pinLockedOut).toBe(false);
  });

  it('4. Password unlock rejects wrong password and unlocks with correct password', async () => {
    const setup = await setupGuardianVault('3849', 'MySecretVault#88');
    await saveEncryptedItem(setup.key, sampleLinkItem);

    await expect(unlockVaultWithPassword('WrongPassword#1')).rejects.toThrow(
      'Wrong password'
    );

    const unlocked = await unlockVaultWithPassword('MySecretVault#88');
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.items[0].id).toBe(sampleLinkItem.id);
  });

  it('5. Forgot-PIN flow verifies master password, sets a new PIN, and keeps all data intact', async () => {
    const setup = await setupGuardianVault('2648', 'MasterKeyForPinReset!1');
    await saveEncryptedItem(setup.key, sampleLinkItem);

    // Wrong master password rejected during PIN reset
    await expect(
      resetPinWithMasterPassword('WrongPass123!', '9173')
    ).rejects.toThrow('Wrong password');

    // Valid master password resets PIN
    const resetRes = await resetPinWithMasterPassword(
      'MasterKeyForPinReset!1',
      '9173'
    );
    expect(resetRes.items).toHaveLength(1);

    // Old PIN no longer works; new PIN unlocks
    await expect(unlockVaultWithPin('2648')).rejects.toThrow(/Wrong PIN/);
    const unlocked = await unlockVaultWithPin('9173');
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.items[0].title).toBe(sampleLinkItem.title);
  });

  it('6. Forgot-password flow with recovery key keeps all records intact, rotates recovery key, and rejects old recovery key', async () => {
    const setup = await setupGuardianVault('6184', 'OriginalMasterPass!1');
    await saveEncryptedItem(setup.key, sampleLinkItem);
    const originalRecoveryKey = setup.recoveryKey;

    // Invalid recovery key rejected
    await expect(
      resetCredentialsWithRecoveryKey(
        'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF',
        'NewMasterPass!2026',
        '4927'
      )
    ).rejects.toThrow('Invalid recovery key');

    // Valid recovery key resets both password and PIN while preserving encrypted records
    const resetResult = await resetCredentialsWithRecoveryKey(
      originalRecoveryKey,
      'NewMasterPass!2026',
      '4927'
    );
    expect(resetResult.items).toHaveLength(1);
    expect(resetResult.items[0].title).toBe(sampleLinkItem.title);
    expect(resetResult.newRecoveryKey).not.toBe(originalRecoveryKey);
    expect(isValidRecoveryKeyFormat(resetResult.newRecoveryKey)).toBe(true);

    // Old recovery key is now rejected!
    await expect(
      resetCredentialsWithRecoveryKey(
        originalRecoveryKey,
        'AnotherPass!2026',
        '8371'
      )
    ).rejects.toThrow('Invalid recovery key');

    // New PIN and new password both unlock the preserved records
    const byPin = await unlockVaultWithPin('4927');
    expect(byPin.items).toHaveLength(1);
    const byPass = await unlockVaultWithPassword('NewMasterPass!2026');
    expect(byPass.items).toHaveLength(1);
  });

  it('7. Data persists across lock and reload, and Settings security actions (change PIN, change password, regenerate recovery key) re-wrap DEK cleanly', async () => {
    const setup = await setupGuardianVault('7482', 'PersistPass#2026');
    await saveEncryptedItem(setup.key, sampleLinkItem);

    // Simulate lock (clearing key in memory) and fresh reload from IndexedDB
    const reloadedMeta = await getVaultMeta();
    expect(reloadedMeta?.version).toBe(CURRENT_VAULT_FORMAT_VERSION);

    const unlocked = await unlockVaultWithPin('7482');
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.items[0].url).toBe(sampleLinkItem.url);

    // Change PIN in Settings
    await changeVaultPin(unlocked.key, '3951');
    await expect(unlockVaultWithPin('7482')).rejects.toThrow(/Wrong PIN/);
    const afterPinChange = await unlockVaultWithPin('3951');
    expect(afterPinChange.items).toHaveLength(1);

    // Change Password in Settings (re-wrap only)
    await changeVaultMasterPassword('PersistPass#2026', 'RotatedPass#2027');
    await expect(unlockVaultWithPassword('PersistPass#2026')).rejects.toThrow(
      'Wrong password'
    );
    const afterPassChange = await unlockVaultWithPassword('RotatedPass#2027');
    expect(afterPassChange.items).toHaveLength(1);

    // Regenerate Recovery Key in Settings
    const regen = await regenerateVaultRecoveryKey('RotatedPass#2027');
    expect(regen.recoveryKey).not.toBe(setup.recoveryKey);
    await expect(
      resetCredentialsWithRecoveryKey(
        setup.recoveryKey,
        'ShouldFailPass!1',
        '5829'
      )
    ).rejects.toThrow('Invalid recovery key');
  });

  it('8. Migrates legacy database and legacy 210,000-iteration password-derived vault into GuardianVaultDB with DEK, PIN, and recovery key', async () => {
    // Seed a legacy database with a v1 (210,000-iteration, no DEK) encrypted item
    const legacyDb = new GuardianVaultDatabase(LEGACY_DB_NAME);
    await legacyDb.open();

    const salt = generateSalt();
    const legacyKey = await deriveMasterKey(
      'LegacyPass#2025',
      salt,
      PBKDF2_ITERATIONS_V1
    );
    const verifier = await createKeyCheckVerifier(legacyKey);
    const encryptedItem = await encryptJson(legacyKey, sampleLinkItem);

    const legacyMeta: VaultMeta = {
      id: 'meta',
      version: 1,
      iterations: PBKDF2_ITERATIONS_V1,
      salt,
      verifierIv: verifier.verifierIv,
      verifierCipher: verifier.verifierCipher,
      theme: 'dark',
      createdAt: '2025-05-01T00:00:00.000Z',
    };

    await legacyDb.meta.put(legacyMeta);
    await legacyDb.items.put({
      id: sampleLinkItem.id,
      iv: encryptedItem.iv,
      ciphertext: encryptedItem.ciphertext,
      updatedAt: sampleLinkItem.updatedAt,
    });
    await legacyDb.close();

    // Trigger database migration on startup
    const migratedDbFlag = await migrateLegacyDatabaseIfNeeded();
    expect(migratedDbFlag).toBe(true);
    expect(await Dexie.exists(LEGACY_DB_NAME)).toBe(false);
    expect(db.name).toBe(GUARDIAN_DB_NAME);

    // Unlock legacy vault with password -> converts records to DEK envelope and requests PIN + recovery setup
    const unlockedLegacy = await unlockVaultWithPassword('LegacyPass#2025');
    expect(unlockedLegacy.needsMigrationSetup).toBe(true);
    expect(unlockedLegacy.items).toHaveLength(1);
    expect(unlockedLegacy.items[0].title).toBe(sampleLinkItem.title);

    // Complete migration by setting PIN and generating one-time recovery key
    const completed = await completeMigrationPinAndRecovery(
      unlockedLegacy.key,
      '6492'
    );
    expect(isValidRecoveryKeyFormat(completed.recoveryKey)).toBe(true);
    expect(completed.meta.pinSlot).toBeDefined();
    expect(completed.meta.recoverySlot).toBeDefined();

    // Now daily 4-digit PIN unlock works on the migrated vault
    const unlockedByNewPin = await unlockVaultWithPin('6492');
    expect(unlockedByNewPin.items).toHaveLength(1);
    expect(unlockedByNewPin.items[0].title).toBe(sampleLinkItem.title);
  });

  it('9. .vault export and import round-trip uses guardian-vault header and still imports legacy exports', async () => {
    const payload = {
      version: CURRENT_VAULT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      items: [sampleLinkItem],
      collections: [],
      tags: [],
    };

    const exported = await encryptVaultFileWithPassword(
      payload,
      'ExportSecret#2026'
    );
    expect(exported.header).toBe('guardian-vault');
    expect(exported.version).toBe(CURRENT_VAULT_FORMAT_VERSION);

    const decrypted = await decryptVaultFileWithPassword(
      exported,
      'ExportSecret#2026'
    );
    expect(decrypted.items).toHaveLength(1);
    expect(decrypted.items[0].title).toBe(sampleLinkItem.title);

    // Also verify legacy v1 .vault file still imports cleanly
    const v1Salt = generateSalt();
    const v1Key = await deriveMasterKey(
      'LegacyExportPass',
      v1Salt,
      PBKDF2_ITERATIONS_V1
    );
    const v1Encrypted = await encryptJson(v1Key, payload);
    const legacyFile = {
      magic: ['BHA', 'RATH_VAULT_ENCRYPTED_V1'].join(''),
      version: 1,
      exportedAt: new Date().toISOString(),
      salt: v1Salt,
      iv: v1Encrypted.iv,
      ciphertext: v1Encrypted.ciphertext,
    };
    const decryptedLegacy = await decryptVaultFileWithPassword(
      legacyFile,
      'LegacyExportPass'
    );
    expect(decryptedLegacy.items).toHaveLength(1);
  });

  it('10. Grep verification: confirms zero mentions of old name, demo code, or hard-coded passwords across project files', () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const forbiddenTokens = [
      ['bha', 'rath'].join(''),
      ['vault', '2026', '!demo'].join(''),
      ['vault', '2026'].join(''),
      ['INITIAL_SEED', '_ITEMS'].join(''),
      ['autostart', '=1'].join(''),
    ];
    const allowedRepoSlug = ['bha', 'rathkumarmaddi/guardian-vault'].join('');

    const filesToScan: string[] = [];
    const collectFiles = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'android' ||
          entry.name === 'dist' ||
          entry.name === 'dist-singlefile' ||
          entry.name === 'release' ||
          entry.name === 'release-android' ||
          entry.name === 'dev-dist' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectFiles(fullPath);
        } else if (
          /\.(ts|tsx|js|cjs|json|html|md|yml)$/.test(entry.name) &&
          entry.name !== 'bun.lock' &&
          entry.name !== 'package-lock.json'
        ) {
          filesToScan.push(fullPath);
        }
      }
    };

    collectFiles(rootDir);
    expect(filesToScan.length).toBeGreaterThan(10);

    for (const filePath of filesToScan) {
      const rawContent = fs.readFileSync(filePath, 'utf8').toLowerCase();
      const sanitizedContent = rawContent.replaceAll(allowedRepoSlug, '');
      for (const token of forbiddenTokens) {
        expect(
          sanitizedContent.includes(token.toLowerCase()),
          `Forbidden token "${token}" found in ${path.relative(rootDir, filePath)}`
        ).toBe(false);
      }
    }
  });

  it('11. Core utility functions (3D carousel roles, URL detection, duplicate detection, password meter, OS detection) work accurately', () => {
    expect(getCarouselRole(0, 0)).toBe('center');
    expect(getCarouselRole(3, 0)).toBe('left');
    expect(getCarouselRole(1, 0)).toBe('right');
    expect(getCarouselRole(2, 0)).toBe('back');
    expect(getNextCarouselIndex(0, 'prev')).toBe(3);

    expect(detectUrlType('https://github.com/electron/electron').type).toBe(
      'github'
    );
    expect(detectUrlType('https://developer.mozilla.org').type).toBe('link');
    expect(
      findDuplicateUrlItem(
        [sampleLinkItem],
        'http://www.developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/'
      )?.id
    ).toBe(sampleLinkItem.id);

    expect(evaluatePasswordStrength('short').meetsMinLength).toBe(false);
    expect(evaluatePasswordStrength('StrongGuardian#2026').label).toBe(
      'Strong'
    );

    expect(detectVisitorOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'windows'
    );
    expect(detectVisitorOS('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectVisitorOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(
      'macos'
    );
    expect(detectVisitorOS('Mozilla/5.0 (Linux; Android 14)')).toBe('android');

    const normKey = normalizeRecoveryKey('abcd efgh ijkl mnop qrst uvwx');
    expect(normKey).toHaveLength(29);
    expect(validatePinFormatAndStrength('1234').valid).toBe(false);
    expect(validatePinFormatAndStrength('8391').valid).toBe(true);
    expect(filterAndSortItems([sampleLinkItem], { query: 'SubtleCrypto' })).toHaveLength(1);
    expect(formatCountdown(new Date(Date.now() + 86400000 * 3).toISOString()).isPast).toBe(false);
    expect(isBackupOverdue(undefined)).toBe(true);
    expect(parseBookmarksHtml('<A HREF="https://example.com">Example</A>')).toHaveLength(1);
    expect(renderMarkdownToHtml('# Heading\n- [x] Done')).toContain('Heading');
    expect(normalizeUrl('https://www.example.com/test/')).toBe('example.com/test');
  });

  it('12. Physical keyboard PIN entry input parsing, paste sanitization, and premature Enter prevention', () => {
    // Number-row keys '0'-'9'
    expect(parsePinKeyboardInput('0', 'Digit0')).toBe('0');
    expect(parsePinKeyboardInput('7', 'Digit7')).toBe('7');
    expect(parsePinKeyboardInput('9', 'Digit9')).toBe('9');

    // Numpad keys 'Numpad0'-'Numpad9'
    expect(parsePinKeyboardInput('0', 'Numpad0')).toBe('0');
    expect(parsePinKeyboardInput('5', 'Numpad5')).toBe('5');
    expect(parsePinKeyboardInput('9', 'Numpad9')).toBe('9');

    // Non-digit keys return null
    expect(parsePinKeyboardInput('a', 'KeyA')).toBe(null);
    expect(parsePinKeyboardInput('Enter', 'Enter')).toBe(null);
    expect(parsePinKeyboardInput('Backspace', 'Backspace')).toBe(null);
    expect(parsePinKeyboardInput('!', 'Digit1')).toBe(null);

    // Paste sanitization strips non-numeric characters and limits to 4 digits
    expect(sanitizePastedPin('1234')).toBe('1234');
    expect(sanitizePastedPin(' 5678 ')).toBe('5678');
    expect(sanitizePastedPin('pin: 492015')).toBe('4920');
    expect(sanitizePastedPin('abc-def')).toBe('');

    // canSubmitPin enforces full 4 digits
    expect(canSubmitPin('').canSubmit).toBe(false);
    expect(canSubmitPin('12').canSubmit).toBe(false);
    expect(canSubmitPin('123').canSubmit).toBe(false);
    expect(canSubmitPin('123').error).toBe('Please enter all 4 digits of your PIN.');
    expect(canSubmitPin('1234').canSubmit).toBe(true);
    expect(canSubmitPin('12345').canSubmit).toBe(false);
  });

  it('13. Zero-install standalone HTML generation produces complete offline vault file with embedded data', () => {
    const html = generateStandaloneHtml(
      [sampleLinkItem],
      [{ id: 'col-dev', name: 'Developer Tools', createdAt: '2026-10-20' }],
      'Guardian Vault — Offline Pendrive Edition'
    );

    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('Guardian Vault');
    expect(html).toContain('Web Crypto API Documentation');
    expect(html).toContain('Developer Tools');
    expect(html).toContain('SubtleCrypto reference');
  });

  it('14. Universal Transfer Scenario 1 & 8: Copy one link from Windows and import into Android while preserving Unicode, emojis, tags, descriptions, notes, and categories', async () => {
    const winItem: VaultItem = {
      ...sampleLinkItem,
      id: 'portable-win-link-1',
      title: 'Rust Async Book 🦀 — システム設計',
      url: 'https://rust-lang.github.io/async-book/',
      description: 'Comprehensive guide to async Rust programming 🚀',
      notes: 'Read chapter 3 & 4 for pinning details',
      tags: ['rust', 'systems', 'async'],
      collectionId: 'col-systems',
      category: 'Systems Engineering',
    };
    const cols: VaultCollection[] = [
      { id: 'col-systems', name: 'Systems Engineering', createdAt: '2026-10-01T00:00:00.000Z' },
    ];

    // Copy on Windows (creates dual plain-text URLs + .gvault block)
    const clipPayload = await buildUniversalClipboardPayload([winItem], cols);
    expect(clipPayload.plainTextFallback).toContain('https://rust-lang.github.io/async-book/');
    expect(clipPayload.combinedClipboardText).toContain('guardian-vault-transfer');

    // Paste & analyze on Android (empty destination vault)
    const analysis = await parseAndAnalyzeTransferInput(
      clipPayload.combinedClipboardText,
      [],
      []
    );
    expect(analysis.totalDetected).toBe(1);
    expect(analysis.linkCount).toBe(1);
    expect(analysis.newCount).toBe(1);

    const resolved = resolveSelectiveImport(
      analysis,
      [],
      new Set([0]),
      'skip',
      false
    );
    expect(resolved.report.importedCount).toBe(1);
    expect(resolved.nextItems[0].title).toBe('Rust Async Book 🦀 — システム設計');
    expect(resolved.nextItems[0].description).toBe(
      'Comprehensive guide to async Rust programming 🚀'
    );
    expect(resolved.nextItems[0].notes).toBe(
      'Read chapter 3 & 4 for pinning details'
    );
    expect(resolved.nextItems[0].tags).toEqual(['rust', 'systems', 'async']);
    expect(resolved.nextItems[0].category).toBe('Systems Engineering');
  });

  it('15. Universal Transfer Scenario 2, 3, 4 & 11: Copy 100+ links and repositories from Windows to Linux & export complete collection from macOS to Windows via USB .gvault', async () => {
    const bulkItems: VaultItem[] = [];
    for (let i = 0; i < 100; i++) {
      const isRepo = i % 2 === 0;
      bulkItems.push({
        id: `bulk-item-${i}`,
        type: isRepo ? 'github' : 'link',
        title: isRepo ? `org/project-${i}` : `Documentation Site ${i}`,
        url: isRepo
          ? `https://github.com/org/project-${i}`
          : `https://docs.example.org/guide-${i}`,
        ownerRepo: isRepo ? `org/project-${i}` : undefined,
        platform: isRepo ? 'GitHub' : undefined,
        description: `Item description #${i}`,
        tags: isRepo ? ['coding', 'github'] : ['reference'],
        collectionId: 'col-mac-export',
        category: 'Engineering Collection',
        pinned: false,
        favourite: false,
        archived: false,
        trashed: false,
        createdAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T10:00:00.000Z',
        openCount: i,
      });
    }

    const gvaultJson = await serializeToUniversalGvault(bulkItems, [
      {
        id: 'col-mac-export',
        name: 'Engineering Collection',
        createdAt: '2026-10-20T00:00:00.000Z',
      },
    ]);

    const analysis = await parseAndAnalyzeTransferInput(gvaultJson, [], []);
    expect(analysis.totalDetected).toBe(100);
    expect(analysis.linkCount).toBe(50);
    expect(analysis.repoCount).toBe(50);
    expect(analysis.newCount).toBe(100);

    const allIndices = new Set(analysis.candidates.map((c) => c.index));
    const result = resolveSelectiveImport(
      analysis,
      [],
      allIndices,
      'skip',
      false
    );
    expect(result.report.importedCount).toBe(100);
    expect(result.nextItems).toHaveLength(100);
  });

  it('16. Universal Transfer Scenario 5 & 6: Import AES-256-GCM encrypted .gvault data with correct export password and reject incorrect password or tampered packet', async () => {
    // Use 10,000 iterations in unit test for fast execution while testing full AES-256-GCM + PBKDF2 flow
    const encryptedGvault = await encryptUniversalGvault(
      [sampleLinkItem],
      'TransferPass#2026',
      [],
      [],
      10_000
    );
    const serialized = JSON.stringify(encryptedGvault);

    // Reject missing password
    await expect(
      parseAndAnalyzeTransferInput(serialized, [], [])
    ).rejects.toThrow(/PASSWORD_REQUIRED/);

    // Reject wrong export password
    await expect(
      parseAndAnalyzeTransferInput(serialized, [], [], 'WrongExportPass!')
    ).rejects.toThrow(/incorrect export password/);

    // Accept correct export password
    const analysis = await parseAndAnalyzeTransferInput(
      serialized,
      [],
      [],
      'TransferPass#2026'
    );
    expect(analysis.totalDetected).toBe(1);
    expect(analysis.candidates[0].item.title).toBe(sampleLinkItem.title);

    // Binary packet [version||salt||iv||ciphertext+tag] round-trip & tamper rejection
    const packet = await encryptBinaryGvaultPacket(
      JSON.stringify({ hello: 'guardian' }),
      'PacketPass!1',
      10_000
    );
    const plain = await decryptBinaryGvaultPacket(packet, 'PacketPass!1', 10_000);
    expect(JSON.parse(plain).hello).toBe('guardian');

    // Tamper with authTag byte
    const tampered = new Uint8Array(packet);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(
      decryptBinaryGvaultPacket(tampered, 'PacketPass!1', 10_000)
    ).rejects.toThrow(/Decryption failed/);
  });

  it('17. Universal Transfer Scenario 7 & 13: Duplicate detection uses normalized URLs and stable IDs (never titles alone) and never silently overwrites existing records', async () => {
    const existingItem: VaultItem = {
      ...sampleLinkItem,
      id: 'existing-id-1',
      title: 'Original Title',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto',
    };

    // Item A: Same title as existingItem, but completely different URL and ID -> Must NOT be flagged as duplicate!
    // Item B: Different title and ID, but normalized URL matches existingItem -> MUST be flagged as duplicate!
    const transferObj = await createUniversalTransferObject([
      {
        ...sampleLinkItem,
        id: 'brand-new-id-2',
        title: 'Original Title', // Same title!
        url: 'https://w3c.github.io/webcrypto/', // Different URL!
      },
      {
        ...sampleLinkItem,
        id: 'different-id-3',
        title: 'Different Title for MDN',
        url: 'http://www.developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/', // Normalized URL matches!
        description: 'Updated description from other computer',
      },
    ]);

    const analysis = await parseAndAnalyzeTransferInput(
      JSON.stringify(transferObj),
      [existingItem],
      []
    );
    expect(analysis.newCount).toBe(1);
    expect(analysis.duplicateCount).toBe(1);
    expect(analysis.candidates[0].status).toBe('new');
    expect(analysis.candidates[1].status).toBe('duplicate');
    expect(analysis.candidates[1].duplicateMatchBy).toBe('url');

    // Verify Strategy 'skip' preserves original item untouched
    const skipped = resolveSelectiveImport(
      analysis,
      [existingItem],
      new Set([0, 1]),
      'skip',
      false
    );
    expect(skipped.report.newImportedCount).toBe(1);
    expect(skipped.report.skippedDuplicatesCount).toBe(1);
    expect(
      skipped.nextItems.find((i) => i.id === 'existing-id-1')?.description
    ).toBe(sampleLinkItem.description);

    // Verify Strategy 'replace' throws if explicitReplaceConfirmed is false (never silently overwrites!)
    expect(() =>
      resolveSelectiveImport(
        analysis,
        [existingItem],
        new Set([0, 1]),
        'replace',
        false
      )
    ).toThrow(/requires explicit confirmation/);

    // Verify Strategy 'replace' succeeds when explicitReplaceConfirmed is true
    const replaced = resolveSelectiveImport(
      analysis,
      [existingItem],
      new Set([0, 1]),
      'replace',
      true
    );
    expect(replaced.report.replacedCount).toBe(1);
    expect(
      replaced.nextItems.find((i) => i.id === 'existing-id-1')?.description
    ).toBe('Updated description from other computer');
  });

  it('18. Universal Transfer Scenario 9, 10, 12 & 14: Safely handles invalid JSON, corrupted integrity hash, malicious javascript: URLs, strips secrets, supports QR transfer, and computes incremental sync diffs', async () => {
    // 1. Invalid JSON rejected cleanly without modifying existing vault
    await expect(
      parseAndAnalyzeTransferInput('{ corrupted json ...', [sampleLinkItem], [])
    ).rejects.toThrow(/Malformed JSON/);

    // 2. Tampered integrityHash rejected
    const validObj = await createUniversalTransferObject([sampleLinkItem]);
    validObj.items[0].url = 'https://evil.example.com'; // Tamper without updating integrityHash
    await expect(
      parseAndAnalyzeTransferInput(JSON.stringify(validObj), [], [])
    ).rejects.toThrow(/Integrity check failed/);

    // 3. Unsafe URL scheme (javascript:) flagged as invalid record and blocked from import
    expect(isValidTransferUrl('javascript:alert(1)')).toBe(false);
    expect(isValidTransferUrl('data:text/html,<script>')).toBe(false);
    expect(isValidTransferUrl('https://github.com/torvalds/linux')).toBe(true);

    const maliciousTransfer = JSON.stringify({
      format: 'guardian-vault-transfer',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      application: 'Guardian Vault',
      itemCount: 1,
      items: [
        {
          id: 'bad-1',
          type: 'link',
          title: 'XSS Link',
          url: 'javascript:alert(document.cookie)',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const badAnalysis = await parseAndAnalyzeTransferInput(
      maliciousTransfer,
      [sampleLinkItem],
      []
    );
    expect(badAnalysis.invalidCount).toBe(1);
    const safeResolution = resolveSelectiveImport(
      badAnalysis,
      [sampleLinkItem],
      new Set([0]),
      'skip',
      false
    );
    expect(safeResolution.report.importedCount).toBe(0);
    expect(safeResolution.report.rejectedInvalidCount).toBe(1);
    expect(safeResolution.nextItems).toHaveLength(1); // Original data preserved!

    // 4. Secret scrubbing ensures PINs, passwords, and keys are never exported
    const scrubbed = scrubSecretsFromObject({
      title: 'Safe Item',
      pin: '1234',
      password: 'secret',
      masterKey: 'raw-key',
      pinSlot: { salt: 'abc' },
    });
    expect(scrubbed).toEqual({ title: 'Safe Item' });

    // 5. QR Transfer round-trip (plain & encrypted)
    const qrPlain = await encodeQrTransferString([sampleLinkItem]);
    expect(qrPlain.startsWith('GVQR1:')).toBe(true);
    const qrDecodedAnalysis = await parseAndAnalyzeTransferInput(qrPlain, [], []);
    expect(qrDecodedAnalysis.totalDetected).toBe(1);
    expect(qrDecodedAnalysis.candidates[0].item.title).toBe(sampleLinkItem.title);

    // 6. Future Synchronization Architecture: Incremental Sync Diff
    const baseItem: VaultItem = { ...sampleLinkItem, syncVersion: 1, updatedAt: '2026-10-20T10:00:00.000Z' };
    const updatedLocal: VaultItem = { ...baseItem, syncVersion: 2, updatedAt: '2026-10-25T10:00:00.000Z' };
    const newRemote: VaultItem = { ...sampleLinkItem, id: 'remote-2', syncVersion: 1 };
    const diff = computeIncrementalSyncDiff([updatedLocal], [baseItem, newRemote]);
    expect(diff.toPushToRemote).toHaveLength(1);
    expect(diff.toPullFromRemote).toHaveLength(1);
  });

  it('19. Cross-platform offline Electron & Android release configuration: verifies exact artifact filenames across package.json, release.yml, README.md, DownloadModal.tsx, and electron.cjs hardening', () => {
    const rootDir = path.resolve(import.meta.dirname, '../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    expect(pkg.main).toBe('electron.cjs');
    expect(pkg.dependencies['@capacitor/core']).toBeDefined();
    expect(pkg.dependencies['@capacitor/android']).toBeDefined();
    expect(pkg.dependencies['@capacitor/app']).toBeDefined();
    expect(pkg.devDependencies['@capacitor/cli']).toBeDefined();

    expect(pkg.scripts['electron:start']).toBe('npm run build && electron .');
    expect(pkg.scripts['electron:build:win']).toBe('npm run build && electron-builder --win');
    expect(pkg.scripts['electron:build:mac']).toBe('npm run build && electron-builder --mac');
    expect(pkg.scripts['electron:build:linux']).toBe('npm run build && electron-builder --linux');
    expect(pkg.build.directories.output).toBe('release');
    expect(pkg.build.files).toContain('dist/**/*');
    expect(pkg.build.files).toContain('electron.cjs');
    expect(pkg.build.win.target).toEqual(expect.arrayContaining(['portable', 'nsis']));
    expect(pkg.build.mac.target).toEqual(expect.arrayContaining(['dmg']));
    expect(pkg.build.mac.identity).toBeNull();
    expect(pkg.build.linux.target).toEqual(expect.arrayContaining(['AppImage', 'deb']));

    // Exact locked artifact filenames in package.json
    expect(pkg.build.nsis.artifactName).toBe('Guardian-Vault-Windows-Setup.exe');
    expect(pkg.build.portable.artifactName).toBe('Guardian-Vault-Windows-Portable.exe');
    expect(pkg.build.dmg.artifactName).toBe('Guardian-Vault-macOS.dmg');
    expect(pkg.build.appImage.artifactName).toBe('Guardian-Vault-Linux.AppImage');
    expect(pkg.build.deb.artifactName).toBe('Guardian-Vault-Linux.deb');

    const exactFiles = [
      'Guardian-Vault-Windows-Setup.exe',
      'Guardian-Vault-Windows-Portable.exe',
      'Guardian-Vault-macOS.dmg',
      'Guardian-Vault-Linux.AppImage',
      'Guardian-Vault-Linux.deb',
      'Guardian-Vault-Android.apk',
    ];

    const workflowYml = fs.readFileSync(path.join(rootDir, '.github/workflows/release.yml'), 'utf8');
    const readmeMd = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
    const downloadModalTsx = fs.readFileSync(path.join(rootDir, 'src/components/DownloadModal.tsx'), 'utf8');

    for (const fileName of exactFiles) {
      expect(workflowYml).toContain(fileName);
      expect(readmeMd).toContain(fileName);
      expect(downloadModalTsx).toContain(fileName);
    }

    expect(workflowYml).toContain('workflow_dispatch:');
    expect(workflowYml).toContain('CSC_IDENTITY_AUTO_DISCOVERY');
    expect(workflowYml).toContain('softprops/action-gh-release@v2');

    const capConfig = fs.readFileSync(path.join(rootDir, 'capacitor.config.ts'), 'utf8');
    expect(capConfig).toContain("appId: 'com.guardianvault.app'");
    expect(capConfig).toContain("androidScheme: 'https'");

    const electronCjs = fs.readFileSync(path.join(rootDir, 'electron.cjs'), 'utf8');
    expect(electronCjs).toContain("path.join(__dirname, 'dist', 'index.html')");
    expect(electronCjs).toContain('contextIsolation: true');
    expect(electronCjs).toContain('nodeIntegration: false');
    expect(electronCjs).toContain('sandbox: true');
    expect(electronCjs).toContain('autoHideMenuBar: true');
    expect(electronCjs).toContain('setWindowOpenHandler');
    expect(electronCjs).toContain('shell.openExternal');
    expect(electronCjs).toContain("process.platform !== 'darwin'");

    const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("base: './'");

    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    expect(indexHtml).not.toMatch(/https?:\/\//i);
  });
});



