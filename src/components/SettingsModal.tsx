import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Sun,
  Moon,
  Trash2,
  Github,
  Activity,
  ShieldAlert,
  Clock,
  RefreshCw,
  Copy,
  Check,
  Download,
  Lock,
} from 'lucide-react';
import { SECTIONS } from '../constants/sections';
import { AutoLockMinutes } from '../types/vault';
import { MIN_SETUP_PASSWORD_LENGTH } from '../utils/vaultLogic';
import { validatePinFormatAndStrength } from '../crypto/webCrypto';

interface SettingsModalProps {
  isOpen: boolean;
  activeSectionIndex: number;
  theme: 'dark' | 'light';
  autoLockMinutes: AutoLockMinutes;
  isOnline: boolean;
  onClose: () => void;
  onToggleTheme: () => Promise<void>;
  onChangeAutoLock: (minutes: AutoLockMinutes) => Promise<void>;
  onChangePin: (newPin: string) => Promise<void>;
  onChangePassword: (currentPass: string, newPass: string) => Promise<void>;
  onRegenerateRecoveryKey: (currentPass: string) => Promise<string>;
  onImportGitHubStars: (username: string) => Promise<number>;
  onRunDeadLinkChecker: () => Promise<void>;
  onWipeVault: () => Promise<void>;
  onOpenDownloadModal: () => void;
  onToast: (msg: string) => void;
}

const AUTO_LOCK_OPTIONS: Array<{ value: AutoLockMinutes; label: string }> = [
  { value: 1, label: '1 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min (Default)' },
  { value: 30, label: '30 min' },
  { value: 0, label: 'Never' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  activeSectionIndex,
  theme,
  autoLockMinutes,
  isOnline,
  onClose,
  onToggleTheme,
  onChangeAutoLock,
  onChangePin,
  onChangePassword,
  onRegenerateRecoveryKey,
  onImportGitHubStars,
  onRunDeadLinkChecker,
  onWipeVault,
  onOpenDownloadModal,
  onToast,
}) => {
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [regenPassword, setRegenPassword] = useState('');
  const [regeneratedKey, setRegeneratedKey] = useState('');
  const [copiedRegen, setCopiedRegen] = useState(false);

  const [ghUsername, setGhUsername] = useState('');
  const [wipeConfirmation, setWipeConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const section = SECTIONS[activeSectionIndex % 4] || SECTIONS[0];

  const handlePinChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const check = validatePinFormatAndStrength(newPin);
    if (!check.valid) {
      setError(check.error || 'Choose a valid 4-digit PIN.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('New PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      await onChangePin(newPin);
      setNewPin('');
      setConfirmNewPin('');
      onToast('4-digit PIN updated (DEK re-wrapped)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update PIN.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < MIN_SETUP_PASSWORD_LENGTH) {
      setError(
        `New password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onToast('Master password updated (DEK re-wrapped)');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to change password.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!regenPassword.trim()) {
      setError('Enter your master password to regenerate the recovery key.');
      return;
    }
    setBusy(true);
    try {
      const freshKey = await onRegenerateRecoveryKey(regenPassword);
      setRegeneratedKey(freshKey);
      setRegenPassword('');
      onToast('New recovery key generated — old recovery key deactivated');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to regenerate recovery key.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStarredImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!ghUsername.trim()) return;
    setBusy(true);
    try {
      const count = await onImportGitHubStars(ghUsername.trim());
      onToast(
        `Imported ${count} starred repositories from @${ghUsername.trim()}`
      );
      setGhUsername('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch GitHub stars.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleWipe = async () => {
    if (wipeConfirmation.trim() !== 'DELETE') {
      setError('Please type DELETE in uppercase to confirm wiping GuardianVaultDB.');
      return;
    }
    setBusy(true);
    try {
      await onWipeVault();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vault Settings and Security"
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border-2 border-zinc-950 p-5 sm:p-7 text-zinc-950 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-5"
        style={{ backgroundColor: section.panel }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
              Security &amp; Preferences
            </span>
            <h2 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight leading-none mt-0.5">
              GUARDIAN SETTINGS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings modal"
            className="w-10 h-10 rounded-full border-2 border-zinc-950 flex items-center justify-center hover:bg-black/10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Section: Auto-Lock Timeout */}
        <div className="rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Clock size={16} />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Security · Auto-Lock Timer
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeAutoLock(opt.value)}
                className={`py-2 px-2.5 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                  autoLockMinutes === opt.value
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white text-zinc-950 border-zinc-950/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Security Section: Change 4-Digit PIN */}
        <form
          onSubmit={handlePinChangeSubmit}
          className="rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Lock size={16} />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Security · Change 4-Digit PIN
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) =>
                setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="New 4-digit PIN"
              className="rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-mono font-bold"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmNewPin}
              onChange={(e) =>
                setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="Confirm 4-digit PIN"
              className="rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-mono font-bold"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
          >
            Update 4-Digit PIN
          </button>
        </form>

        {/* Security Section: Change Master Password (Re-Wrap DEK Only) */}
        <form
          onSubmit={handlePasswordChange}
          className="rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <KeyRound size={16} />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Security · Change Master Password (Re-Wrap DEK)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ chars)"
              className="rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium"
            />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new"
              className="rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
          >
            Update Master Password
          </button>
        </form>

        {/* Security Section: Regenerate Recovery Key */}
        <form
          onSubmit={handleRegenerateRecovery}
          className="rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <RefreshCw size={16} />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Security · Regenerate Recovery Key
            </h3>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={regenPassword}
              onChange={(e) => setRegenPassword(e.target.value)}
              placeholder="Confirm master password to generate new recovery key..."
              className="flex-1 rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Regenerate Key
            </button>
          </div>
          {regeneratedKey && (
            <div className="rounded-xl bg-zinc-950 text-white p-3 space-y-2">
              <div className="text-[11px] text-amber-300 font-semibold">
                Save your new recovery key now. Your previous recovery key no longer works.
              </div>
              <div
                data-testid="regenerated-recovery-key"
                className="font-mono text-xs sm:text-sm font-bold text-center select-all break-all"
              >
                {regeneratedKey}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(regeneratedKey);
                  setCopiedRegen(true);
                  setTimeout(() => setCopiedRegen(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-zinc-950 px-3 py-1 text-xs font-bold uppercase cursor-pointer"
              >
                {copiedRegen ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedRegen ? 'Copied!' : 'Copy Recovery Key'}</span>
              </button>
            </div>
          )}
        </form>

        {/* Appearance & Native Downloads */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Appearance &amp; Native Apps
            </h3>
            <p className="text-xs text-zinc-700 mt-0.5">
              Switch workspace theme or download desktop/mobile installers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDownloadModal();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-zinc-950 px-3.5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-zinc-950 hover:text-white cursor-pointer"
            >
              <Download size={14} />
              <span>Downloads</span>
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>

        {/* Optional Metadata Fetch & Online Extras */}
        <div className="rounded-2xl bg-white/80 border-2 border-zinc-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Optional Metadata Tools ({isOnline ? 'Connected' : 'Offline'})
            </h3>
            <button
              type="button"
              disabled={!isOnline || busy}
              onClick={async () => {
                setBusy(true);
                await onRunDeadLinkChecker();
                setBusy(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-zinc-950 px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-950 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Activity size={14} />
              <span>Run Dead Link Checker</span>
            </button>
          </div>

          <form onSubmit={handleStarredImport} className="flex gap-2">
            <input
              type="text"
              value={ghUsername}
              onChange={(e) => setGhUsername(e.target.value)}
              disabled={!isOnline || busy}
              placeholder="GitHub username to import starred repos..."
              className="flex-1 rounded-xl bg-white border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium text-zinc-950"
            />
            <button
              type="submit"
              disabled={!isOnline || busy || !ghUsername.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer"
            >
              <Github size={14} />
              <span>Import Stars</span>
            </button>
          </form>
        </div>

        {/* Wipe Vault with Typed Confirmation */}
        <div className="rounded-2xl bg-red-950/90 text-red-100 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-300" />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Danger Zone: Wipe GuardianVaultDB
            </h3>
          </div>
          <p className="text-xs text-red-200/90">
            Permanently erases all encrypted records, collections, and wrapped keys from GuardianVaultDB. Type <strong>DELETE</strong> below to confirm.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={wipeConfirmation}
              onChange={(e) => setWipeConfirmation(e.target.value)}
              placeholder="Type DELETE"
              className="flex-1 rounded-xl bg-black/40 border border-red-400/40 px-3 py-2 text-xs font-mono text-white placeholder:text-red-300/50"
            />
            <button
              type="button"
              disabled={busy || wipeConfirmation.trim() !== 'DELETE'}
              onClick={handleWipe}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 text-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-red-400 disabled:opacity-40 cursor-pointer"
            >
              <Trash2 size={14} />
              <span>Wipe Vault</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-950 text-red-100 px-3.5 py-2.5 text-xs font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
