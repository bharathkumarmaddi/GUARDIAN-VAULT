export type ItemType = 'link' | 'github' | 'note' | 'hackathon';

export type HackathonStatus =
  | 'Interested'
  | 'Registered'
  | 'Building'
  | 'Submitted'
  | 'Done';

export type SortOption = 'newest' | 'az' | 'updated' | 'most_opened';

export type ViewMode = 'grid' | 'list';

export type DeadLinkStatus = 'unknown' | 'ok' | 'dead' | 'checking';

export type AutoLockMinutes = 1 | 2 | 5 | 10 | 15 | 30 | 0;

export interface VaultItem {
  id: string;
  type: ItemType;
  title: string;
  url?: string;
  description?: string;
  // Website link specific
  favicon?: string;
  // GitHub repo specific
  ownerRepo?: string;
  stars?: number;
  language?: string;
  lastUpdated?: string;
  notes?: string;
  readmePreview?: string;
  // Note specific (markdown)
  content?: string;
  // Hackathon specific
  startDate?: string;
  deadline?: string;
  hackathonStatus?: HackathonStatus;
  teamMembers?: string[];
  // Common metadata
  tags: string[];
  collectionId: string;
  category?: string;
  platform?: string;
  pinned: boolean;
  favourite: boolean;
  archived: boolean;
  trashed: boolean;
  trashedAt?: string;
  createdAt: string;
  updatedAt: string;
  openCount: number;
  deadLinkStatus?: DeadLinkStatus;
  // Synchronization & portability metadata
  syncVersion?: number;
  contentHash?: string;
  originDevice?: string;
}

export interface VaultCollection {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
}

export interface VaultTag {
  id: string;
  name: string;
  color: string;
}

export interface EncryptedRecord {
  id: string;
  iv: string; // base64 12-byte IV
  ciphertext: string; // base64 AES-GCM ciphertext
  updatedAt: string;
}

export interface WrappedKeySlot {
  salt: string; // base64 16-byte random salt
  iterations: number; // 600,000 (PBKDF2-SHA256)
  wrappedDekIv: string; // base64 12-byte IV
  wrappedDekCipher: string; // base64 AES-GCM wrapped 256-bit DEK
  verifierIv: string; // base64 12-byte IV
  verifierCipher: string; // base64 key-check ciphertext
}

export interface VaultMeta {
  id: 'meta';
  version?: number; // 1 = legacy 210k, 2 = legacy 600k, 3 = Guardian Envelope DEK
  iterations?: number;
  // Legacy v1/v2 password-derived fields (used only before migration to v3)
  salt?: string;
  verifierIv?: string;
  verifierCipher?: string;
  // Guardian v3 envelope encryption slots
  pinSlot?: WrappedKeySlot;
  passwordSlot?: WrappedKeySlot;
  recoverySlot?: WrappedKeySlot;
  dekVerifierIv?: string;
  dekVerifierCipher?: string;
  // PIN rate-limiting & lockout state
  failedPinAttempts?: number;
  pinLockedOut?: boolean;
  lastFailedPinAt?: number;
  // Preferences
  autoLockMinutes?: AutoLockMinutes;
  theme: 'dark' | 'light';
  lastBackupAt?: string;
  createdAt: string;
}

export interface DecryptedVaultPayload {
  version: number;
  exportedAt: string;
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
}

export interface EncryptedVaultFile {
  header?: 'guardian-vault';
  magic?: string; // Legacy compatibility
  version: number;
  iterations?: number;
  exportedAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export type DuplicateStrategy = 'skip' | 'replace' | 'keep_both';

export type PortableItemType = 'link' | 'repository' | 'github' | 'note' | 'hackathon';

export interface PortableTransferItem {
  id: string;
  type: PortableItemType;
  title: string;
  url?: string;
  description?: string;
  platform?: string;
  tags: string[];
  category?: string;
  collectionId?: string;
  notes?: string;
  content?: string;
  favicon?: string;
  ownerRepo?: string;
  stars?: number;
  language?: string;
  lastUpdated?: string;
  readmePreview?: string;
  startDate?: string;
  deadline?: string;
  hackathonStatus?: HackathonStatus;
  teamMembers?: string[];
  pinned?: boolean;
  favourite?: boolean;
  archived?: boolean;
  openCount?: number;
  createdAt: string;
  updatedAt?: string;
  syncVersion?: number;
  contentHash?: string;
}

export interface UniversalTransferFile {
  format: 'guardian-vault-transfer' | 'guardianvault-transfer';
  schemaVersion: number;
  exportedAt: string;
  application: 'Guardian Vault';
  sourcePlatform?: string;
  itemCount: number;
  integrityHash?: string;
  items: PortableTransferItem[];
  collections?: VaultCollection[];
  tags?: VaultTag[];
}

export interface EncryptedUniversalTransferFile {
  format: 'guardian-vault-transfer-encrypted';
  schemaVersion: number;
  exportedAt: string;
  application: 'Guardian Vault';
  kdf: 'PBKDF2-HMAC-SHA256' | 'Argon2id-Compatible-PBKDF2';
  cipher: 'AES-256-GCM';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  itemCount: number;
}

export interface ImportCandidateEntry {
  index: number;
  item: VaultItem;
  status: 'new' | 'duplicate' | 'invalid' | 'unsupported';
  duplicateMatchBy?: 'url' | 'id';
  existingItem?: VaultItem;
  reason?: string;
}

export interface ImportPreviewAnalysis {
  totalDetected: number;
  linkCount: number;
  repoCount: number;
  noteCount: number;
  hackathonCount: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  unsupportedCount: number;
  candidates: ImportCandidateEntry[];
  collections: VaultCollection[];
  tags: VaultTag[];
  sourceFormat: string;
}

export interface ImportExecutionReport {
  importedCount: number;
  newImportedCount: number;
  replacedCount: number;
  keptBothCount: number;
  skippedDuplicatesCount: number;
  rejectedInvalidCount: number;
}

export type CarouselRole = 'center' | 'left' | 'right' | 'back';

export interface SectionTheme {
  index: number;
  id: ItemType;
  name: string;
  ghostText: string;
  openCta: string;
  countLabel: string;
  singularLabel: string;
  bg: string;
  panel: string;
  image: string;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  bars: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  meetsMinLength: boolean;
  isWeakWarning: boolean;
  tips: string[];
}

