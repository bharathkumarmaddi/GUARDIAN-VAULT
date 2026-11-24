import React, { useEffect, useMemo, useState } from 'react';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  AlertTriangle,
  Copy,
  Check,
  Download,
  Printer,
  RotateCcw,
  Trash2,
  Delete,
  Keyboard,
} from 'lucide-react';
import { SECTIONS } from '../constants/sections';
import {
  MAX_PIN_ATTEMPTS,
  MIN_SETUP_PASSWORD_LENGTH,
  canSubmitPin,
  evaluatePasswordStrength,
  getPinAttemptDelayMs,
  parsePinKeyboardInput,
  sanitizePastedPin,
} from '../utils/vaultLogic';
import {
  generateRecoveryKey,
  isValidRecoveryKeyFormat,
  normalizeRecoveryKey,
  validatePinFormatAndStrength,
} from '../crypto/webCrypto';
import { VaultMeta } from '../types/vault';
import { isLegacyVaultMeta } from '../db/vaultDb';
import { GrainOverlay } from './GrainOverlay';

interface LockScreenProps {
  isInitialized: boolean;
  vaultMeta: VaultMeta | null;
  activeSectionIndex: number;
  pendingMigrationSetup: boolean;
  onUnlockWithPin: (pin: string) => Promise<void>;
  onUnlockWithPassword: (password: string) => Promise<void>;
  onCompleteSetup: (
    pin: string,
    password: string,
    recoveryKey: string
  ) => Promise<void>;
  onCompleteMigration: (pin: string, recoveryKey: string) => Promise<void>;
  onResetPinWithPassword: (password: string, newPin: string) => Promise<void>;
  onResetPasswordWithRecoveryKey: (
    recoveryKey: string,
    newPassword: string,
    newPin: string
  ) => Promise<string>;
  onStartFreshWipe: () => Promise<void>;
  onOpenDownloadModal: () => void;
}

type UnlockMode =
  | 'pin'
  | 'password'
  | 'forgot_pin'
  | 'forgot_password'
  | 'post_recovery_key'
  | 'start_fresh';

type SetupStep = 1 | 2 | 3;

export const LockScreen: React.FC<LockScreenProps> = ({
  isInitialized,
  vaultMeta,
  activeSectionIndex,
  pendingMigrationSetup,
  onUnlockWithPin,
  onUnlockWithPassword,
  onCompleteSetup,
  onCompleteMigration,
  onResetPinWithPassword,
  onResetPasswordWithRecoveryKey,
  onStartFreshWipe,
  onOpenDownloadModal,
}) => {
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(
    activeSectionIndex % 4
  );
  useEffect(() => {
    setSelectedSectionIndex(activeSectionIndex % 4);
  }, [activeSectionIndex]);

  const section = SECTIONS[selectedSectionIndex % 4] || SECTIONS[0];

  const isLegacy = isLegacyVaultMeta(vaultMeta);
  const isPinLockedOut =
    Boolean(vaultMeta?.pinLockedOut) ||
    (vaultMeta?.failedPinAttempts || 0) >= MAX_PIN_ATTEMPTS;

  // Setup Wizard State (Step 1: PIN, Step 2: Password, Step 3: Recovery Key)
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [setupPinStage, setSetupPinStage] = useState<'enter' | 'confirm'>('enter');
  const [setupPin, setSetupPin] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string>(() =>
    generateRecoveryKey()
  );
  const [recoveryLast4Input, setRecoveryLast4Input] = useState('');
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // Unlock Screen State
  const [unlockMode, setUnlockMode] = useState<UnlockMode>(() =>
    isLegacy || isPinLockedOut ? 'password' : 'pin'
  );
  const [pinEntry, setPinEntry] = useState('');
  const [passwordEntry, setPasswordEntry] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot PIN State
  const [forgotPinPassword, setForgotPinPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  // Forgot Password (Recovery Key) State
  const [recoveryInput, setRecoveryInput] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetNewPasswordConfirm, setResetNewPasswordConfirm] = useState('');
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetNewPinConfirm, setResetNewPinConfirm] = useState('');
  const [postResetRecoveryKey, setPostResetRecoveryKey] = useState('');
  const [postResetLast4, setPostResetLast4] = useState('');

  // Start Fresh (2 confirmations + DELETE) State
  const [freshConfirmStep, setFreshConfirmStep] = useState<1 | 2 | 3>(1);
  const [freshDeleteInput, setFreshDeleteInput] = useState('');

  // Cooldown timer between failed PIN attempts
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Physical keyboard PIN entry refs and focus state
  const pinInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isPinInputFocused, setIsPinInputFocused] = useState(false);

  const isPinActive =
    !isInitialized || pendingMigrationSetup
      ? setupStep === 1
      : unlockMode === 'pin';

  const focusPinInput = React.useCallback(() => {
    if (pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, []);

  // Auto-focus physical PIN input whenever PIN entry becomes active or stage changes
  useEffect(() => {
    if (isPinActive && !loading) {
      focusPinInput();
      const timer = window.setTimeout(() => focusPinInput(), 60);
      return () => window.clearTimeout(timer);
    }
  }, [isPinActive, setupStep, setupPinStage, unlockMode, loading, focusPinInput]);

  useEffect(() => {
    if (isLegacy || isPinLockedOut) {
      if (unlockMode === 'pin') {
        setUnlockMode('password');
      }
    }
  }, [isLegacy, isPinLockedOut, unlockMode]);

  useEffect(() => {
    if (!vaultMeta?.lastFailedPinAt || !vaultMeta?.failedPinAttempts) {
      setCooldownRemainingSec(0);
      return;
    }
    const delayMs = getPinAttemptDelayMs(vaultMeta.failedPinAttempts);
    const updateRemaining = () => {
      const elapsed = Date.now() - (vaultMeta.lastFailedPinAt || 0);
      const rem = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
      setCooldownRemainingSec(rem);
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [vaultMeta?.lastFailedPinAt, vaultMeta?.failedPinAttempts]);

  // Physical keyboard / on-screen digit entry
  const handleDigitPress = React.useCallback(
    (digit: string) => {
      setError('');
      if (!isInitialized || pendingMigrationSetup) {
        if (setupStep !== 1) return;
        if (setupPinStage === 'enter') {
          if (setupPin.length < 4) {
            setSetupPin((prev) => prev + digit);
          }
        } else {
          if (setupPinConfirm.length < 4) {
            setSetupPinConfirm((prev) => prev + digit);
          }
        }
        return;
      }

      if (unlockMode === 'pin') {
        if (isPinLockedOut || cooldownRemainingSec > 0 || loading) return;
        if (pinEntry.length < 4) {
          const nextPin = pinEntry + digit;
          setPinEntry(nextPin);
          if (nextPin.length === 4) {
            void submitPinUnlock(nextPin);
          }
        }
      }
    },
    [
      isInitialized,
      pendingMigrationSetup,
      setupStep,
      setupPinStage,
      setupPin.length,
      setupPinConfirm.length,
      unlockMode,
      isPinLockedOut,
      cooldownRemainingSec,
      loading,
      pinEntry,
    ]
  );

  const handleBackspacePress = React.useCallback(() => {
    setError('');
    if (!isInitialized || pendingMigrationSetup) {
      if (setupStep !== 1) return;
      if (setupPinStage === 'enter') {
        setSetupPin((prev) => prev.slice(0, -1));
      } else {
        setSetupPinConfirm((prev) => prev.slice(0, -1));
      }
      return;
    }
    if (unlockMode === 'pin') {
      setPinEntry((prev) => prev.slice(0, -1));
    }
  }, [isInitialized, pendingMigrationSetup, setupStep, setupPinStage, unlockMode]);

  const handleClearPin = React.useCallback(() => {
    setError('');
    if (!isInitialized || pendingMigrationSetup) {
      if (setupPinStage === 'enter') setSetupPin('');
      else setSetupPinConfirm('');
      return;
    }
    setPinEntry('');
  }, [isInitialized, pendingMigrationSetup, setupPinStage]);

  const submitPinUnlock = React.useCallback(
    async (candidatePin: string) => {
      const check = canSubmitPin(candidatePin);
      if (!check.canSubmit) {
        setError(check.error || 'Please enter all 4 digits of your PIN.');
        return;
      }
      if (isPinLockedOut) {
        setError(
          'PIN is disabled after 5 wrong attempts. Unlock with your master password.'
        );
        setUnlockMode('password');
        return;
      }
      if (cooldownRemainingSec > 0) {
        setError(`Please wait ${cooldownRemainingSec}s before trying again.`);
        return;
      }
      setLoading(true);
      setError('');
      try {
        await onUnlockWithPin(candidatePin);
        setPinEntry('');
      } catch (err) {
        setPinEntry('');
        setError(err instanceof Error ? err.message : 'Wrong PIN');
      } finally {
        setLoading(false);
      }
    },
    [isPinLockedOut, cooldownRemainingSec, onUnlockWithPin]
  );

  const handleSetupPinContinue = React.useCallback(() => {
    setError('');
    if (setupPinStage === 'enter') {
      const check = validatePinFormatAndStrength(setupPin);
      if (!check.valid) {
        setError(check.error || 'Choose a valid 4-digit PIN.');
        return;
      }
      setSetupPinStage('confirm');
      return;
    }

    if (setupPinConfirm !== setupPin) {
      setError('PINs do not match. Please try again.');
      setSetupPinConfirm('');
      return;
    }

    if (pendingMigrationSetup) {
      // Legacy vault migration: skip password creation (already set) and go straight to Step 3 (Recovery Key)
      setGeneratedRecoveryKey(generateRecoveryKey());
      setRecoveryLast4Input('');
      setSetupStep(3);
    } else {
      setSetupStep(2);
    }
  }, [setupPinStage, setupPin, setupPinConfirm, pendingMigrationSetup]);

  // Handle Enter key for physical keyboard: submits if 4 digits, otherwise displays clear warning
  const handleEnterPress = React.useCallback(() => {
    if (!isInitialized || pendingMigrationSetup) {
      if (setupStep === 1) {
        const val = setupPinStage === 'enter' ? setupPin : setupPinConfirm;
        const check = canSubmitPin(val);
        if (!check.canSubmit) {
          setError(check.error || 'Please enter all 4 digits of your PIN.');
          return;
        }
        handleSetupPinContinue();
      }
    } else if (unlockMode === 'pin') {
      const check = canSubmitPin(pinEntry);
      if (!check.canSubmit) {
        setError(check.error || 'Please enter all 4 digits of your PIN.');
        return;
      }
      void submitPinUnlock(pinEntry);
    }
  }, [
    isInitialized,
    pendingMigrationSetup,
    setupStep,
    setupPinStage,
    setupPin,
    setupPinConfirm,
    unlockMode,
    pinEntry,
    handleSetupPinContinue,
    submitPinUnlock,
  ]);

  // Handle Escape key: cancels or steps back
  const handleEscapePress = React.useCallback(() => {
    setError('');
    if (!isInitialized || pendingMigrationSetup) {
      if (setupPinStage === 'confirm') {
        setSetupPinStage('enter');
        setSetupPinConfirm('');
      } else {
        setSetupPin('');
      }
    } else if (unlockMode === 'pin') {
      if (pinEntry.length > 0) {
        setPinEntry('');
      }
    }
  }, [isInitialized, pendingMigrationSetup, setupPinStage, unlockMode, pinEntry.length]);

  // Handle pasted PIN input safely
  const handlePinStateUpdate = React.useCallback(
    (sanitized: string) => {
      setError('');
      if (!isInitialized || pendingMigrationSetup) {
        if (setupStep !== 1) return;
        if (setupPinStage === 'enter') {
          setSetupPin(sanitized);
        } else {
          setSetupPinConfirm(sanitized);
        }
        return;
      }
      if (unlockMode === 'pin') {
        if (isPinLockedOut || cooldownRemainingSec > 0 || loading) return;
        setPinEntry(sanitized);
        if (sanitized.length === 4) {
          void submitPinUnlock(sanitized);
        }
      }
    },
    [
      isInitialized,
      pendingMigrationSetup,
      setupStep,
      setupPinStage,
      unlockMode,
      isPinLockedOut,
      cooldownRemainingSec,
      loading,
      submitPinUnlock,
    ]
  );

  // Global physical keyboard listener for number row, numpad, backspace, enter, escape
  useEffect(() => {
    if (!isPinActive) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if focus is inside an unrelated form element
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== pinInputRef.current &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }

      const digit = parsePinKeyboardInput(e.key, e.code);
      if (digit !== null) {
        e.preventDefault();
        focusPinInput();
        handleDigitPress(digit);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        focusPinInput();
        handleBackspacePress();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnterPress();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleEscapePress();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isPinActive,
    handleDigitPress,
    handleBackspacePress,
    handleEnterPress,
    handleEscapePress,
    focusPinInput,
  ]);

  const activePasswordForMeter = !isInitialized
    ? setupPassword
    : unlockMode === 'forgot_password'
    ? resetNewPassword
    : passwordEntry;

  const strength = useMemo(
    () => evaluatePasswordStrength(activePasswordForMeter),
    [activePasswordForMeter]
  );

  const getBarColorClass = (barIdx: number): string => {
    if (barIdx > strength.bars) return 'bg-zinc-950/15';
    switch (strength.bars) {
      case 1:
        return 'bg-red-600';
      case 2:
        return 'bg-amber-600';
      case 3:
        return 'bg-emerald-600';
      case 4:
      default:
        return 'bg-emerald-800';
    }
  };

  const handleCopyRecoveryKey = async (keyToCopy: string) => {
    try {
      await navigator.clipboard.writeText(keyToCopy);
      setCopiedRecovery(true);
      setTimeout(() => setCopiedRecovery(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleDownloadRecoveryTxt = (keyToSave: string) => {
    const text = [
      'GUARDIAN VAULT — RECOVERY KEY',
      '=============================',
      '',
      `Recovery Key: ${keyToSave}`,
      `Created: ${new Date().toUTCString()}`,
      '',
      'WARNING: If you forget your PIN and password and lose this key, your data cannot be recovered.',
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guardian-vault-recovery-key.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintRecoveryKey = () => {
    window.print();
  };

  const handleSetupPasswordContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (setupPassword.length < MIN_SETUP_PASSWORD_LENGTH) {
      setError(
        `Master password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setGeneratedRecoveryKey(generateRecoveryKey());
    setRecoveryLast4Input('');
    setSetupStep(3);
  };

  const handleFinishSetupWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const expectedLast4 = generatedRecoveryKey.slice(-4).toUpperCase();
    if (recoveryLast4Input.trim().toUpperCase() !== expectedLast4) {
      setError(
        `Type the last 4 characters of your recovery key (${expectedLast4}) to confirm you saved it.`
      );
      return;
    }

    setLoading(true);
    try {
      if (pendingMigrationSetup) {
        await onCompleteMigration(setupPin, generatedRecoveryKey);
      } else {
        await onCompleteSetup(setupPin, setupPassword, generatedRecoveryKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!passwordEntry.trim()) {
      setError('Enter your master password.');
      return;
    }
    setLoading(true);
    try {
      await onUnlockWithPassword(passwordEntry);
      setPasswordEntry('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!forgotPinPassword.trim()) {
      setError('Enter your master password.');
      return;
    }
    const check = validatePinFormatAndStrength(newPin);
    if (!check.valid) {
      setError(check.error || 'Invalid 4-digit PIN.');
      return;
    }
    if (newPin !== newPinConfirm) {
      setError('New PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      await onResetPinWithPassword(forgotPinPassword, newPin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isValidRecoveryKeyFormat(recoveryInput)) {
      setError('Invalid recovery key');
      return;
    }
    if (resetNewPassword.length < MIN_SETUP_PASSWORD_LENGTH) {
      setError(
        `New password must be at least ${MIN_SETUP_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (resetNewPassword !== resetNewPasswordConfirm) {
      setError('New passwords do not match.');
      return;
    }
    const pinCheck = validatePinFormatAndStrength(resetNewPin);
    if (!pinCheck.valid) {
      setError(pinCheck.error || 'Invalid 4-digit PIN.');
      return;
    }
    if (resetNewPin !== resetNewPinConfirm) {
      setError('New PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      const freshKey = await onResetPasswordWithRecoveryKey(
        normalizeRecoveryKey(recoveryInput),
        resetNewPassword,
        resetNewPin
      );
      setPostResetRecoveryKey(freshKey);
      setPostResetLast4('');
      setUnlockMode('post_recovery_key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid recovery key');
    } finally {
      setLoading(false);
    }
  };

  const handleStartFreshSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (freshDeleteInput.trim() !== 'DELETE') {
      setError('Type DELETE in uppercase to confirm wiping GuardianVaultDB.');
      return;
    }
    setLoading(true);
    try {
      await onStartFreshWipe();
      setSetupStep(1);
      setSetupPinStage('enter');
      setSetupPin('');
      setSetupPinConfirm('');
      setSetupPassword('');
      setSetupPasswordConfirm('');
      setFreshConfirmStep(1);
      setFreshDeleteInput('');
      setUnlockMode('pin');
    } finally {
      setLoading(false);
    }
  };

  const renderNumberPad = (currentValue: string, onSubmitNow?: () => void) => (
    <div className="space-y-3">
      {/* Hidden Accessible Input for Physical Keyboard / External Keyboard / Mobile Screen Readers */}
      <input
        ref={pinInputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={4}
        value={currentValue}
        aria-label={
          !isInitialized || pendingMigrationSetup
            ? setupPinStage === 'enter'
              ? 'Enter 4-digit PIN'
              : 'Confirm 4-digit PIN'
            : 'Enter 4-digit unlock PIN'
        }
        onFocus={() => setIsPinInputFocused(true)}
        onBlur={() => setIsPinInputFocused(false)}
        onChange={(e) => {
          const s = sanitizePastedPin(e.target.value);
          handlePinStateUpdate(s);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleEnterPress();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleEscapePress();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData('text');
          const s = sanitizePastedPin(pasted);
          if (s) handlePinStateUpdate(s);
        }}
        className="opacity-0 absolute -z-10 pointer-events-none w-0 h-0"
        tabIndex={-1}
      />

      {/* 4-Digit Dots Display with Interactive Focus Ring & Active Dot Cursor */}
      <div
        data-testid="pin-dots-display"
        onClick={focusPinInput}
        className="flex items-center justify-center gap-4 py-2 cursor-pointer group"
        title="Click to focus physical keyboard PIN entry"
      >
        {[0, 1, 2, 3].map((idx) => {
          const filled = idx < currentValue.length;
          const isCurrent = idx === currentValue.length;
          return (
            <div
              key={idx}
              className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                filled
                  ? 'bg-zinc-950 text-white scale-105 border-zinc-950 shadow-md'
                  : isCurrent && isPinInputFocused
                  ? 'bg-white text-zinc-950 border-zinc-950 ring-2 ring-zinc-950 ring-offset-2'
                  : isCurrent
                  ? 'bg-white text-zinc-500 border-zinc-950'
                  : 'bg-white/80 text-zinc-400 border-zinc-950/20'
              }`}
            >
              {filled ? (
                '●'
              ) : isCurrent ? (
                <span className="w-2 h-2 rounded-full bg-zinc-950/70 animate-pulse" />
              ) : (
                ''
              )}
            </div>
          );
        })}
      </div>

      {/* Physical Keyboard Helper Prompt */}
      <div
        onClick={focusPinInput}
        className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-zinc-800/80 cursor-pointer"
      >
        <Keyboard size={13} className="text-zinc-950" />
        <span>Type with your physical keyboard or use the keypad below</span>
      </div>

      {/* Big 3x4 On-Screen Keypad for Touch / Mouse */}
      <div className="grid grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={loading || cooldownRemainingSec > 0}
            onClick={() => {
              focusPinInput();
              handleDigitPress(digit);
            }}
            aria-label={`Digit ${digit}`}
            className="h-13 rounded-2xl bg-white/90 border-2 border-zinc-950/20 text-lg font-bold text-zinc-950 hover:bg-zinc-950 hover:text-white transition-colors cursor-pointer disabled:opacity-40 active:scale-95"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            focusPinInput();
            handleClearPin();
          }}
          aria-label="Clear PIN"
          className="h-13 rounded-2xl bg-black/10 border-2 border-zinc-950/15 text-xs font-bold uppercase tracking-wider text-zinc-900 hover:bg-black/20 cursor-pointer active:scale-95"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={loading || cooldownRemainingSec > 0}
          onClick={() => {
            focusPinInput();
            handleDigitPress('0');
          }}
          aria-label="Digit 0"
          className="h-13 rounded-2xl bg-white/90 border-2 border-zinc-950/20 text-lg font-bold text-zinc-950 hover:bg-zinc-950 hover:text-white transition-colors cursor-pointer disabled:opacity-40 active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            focusPinInput();
            handleBackspacePress();
          }}
          aria-label="Backspace PIN"
          className="h-13 rounded-2xl bg-black/10 border-2 border-zinc-950/15 flex items-center justify-center text-zinc-900 hover:bg-black/20 cursor-pointer active:scale-95"
        >
          <Delete size={18} />
        </button>
      </div>

      {onSubmitNow && (
        <button
          type="button"
          disabled={loading || currentValue.length !== 4}
          onClick={onSubmitNow}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white py-3 px-5 text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
        >
          <span>Continue</span>
          <ArrowRight size={17} />
        </button>
      )}
    </div>
  );

  return (
    <div
      className="relative h-screen w-screen overflow-hidden flex flex-col items-center justify-center px-4 select-none"
      style={{
        backgroundColor: section.bg,
        transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <GrainOverlay />

      {/* Top Brand Header */}
      <div className="fixed top-6 left-6 sm:left-10 z-60 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white opacity-90">
          GUARDIAN VAULT
        </span>
      </div>

      <div className="fixed top-5 right-6 sm:right-10 z-60 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDownloadModal}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer"
        >
          <Download size={14} />
          <span>Download App</span>
        </button>
      </div>

      {/* Main Card */}
      <div
        className="relative z-40 w-full max-w-md rounded-3xl p-6 sm:p-7 border-2 border-white/40 shadow-2xl text-zinc-950 backdrop-blur-md max-h-[88vh] overflow-y-auto"
        style={{
          backgroundColor: section.panel,
          transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* SETUP WIZARD OR LEGACY MIGRATION COMPLETION */}
        {!isInitialized || pendingMigrationSetup ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center">
                <KeyRound size={19} />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
                {pendingMigrationSetup
                  ? 'Vault Upgrade · Envelope Key Setup'
                  : `Setup Wizard · Step ${setupStep} of 3`}
              </span>
            </div>

            {setupStep === 1 && (
              <>
                <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
                  {setupPinStage === 'enter'
                    ? 'CREATE 4-DIGIT PIN'
                    : 'CONFIRM 4-DIGIT PIN'}
                </h1>
                <p className="text-xs text-zinc-900/80">
                  {setupPinStage === 'enter'
                    ? 'Used for quick daily unlock (PBKDF2-SHA256, 600,000 iterations). Weak PINs like 0000, 1111, 1234, and 4321 are blocked.'
                    : 'Re-enter your 4-digit PIN on the number pad to confirm.'}
                </p>

                {renderNumberPad(
                  setupPinStage === 'enter' ? setupPin : setupPinConfirm,
                  handleSetupPinContinue
                )}

                {setupPinStage === 'confirm' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSetupPinStage('enter');
                      setSetupPin('');
                      setSetupPinConfirm('');
                      setError('');
                    }}
                    className="w-full text-center text-xs font-bold uppercase tracking-wider underline text-zinc-900 cursor-pointer"
                  >
                    Back — Change PIN
                  </button>
                )}
              </>
            )}

            {setupStep === 2 && !pendingMigrationSetup && (
              <form onSubmit={handleSetupPasswordContinue} className="space-y-3.5">
                <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
                  CREATE MASTER PASSWORD
                </h1>
                <p className="text-xs text-zinc-900/80">
                  Minimum {MIN_SETUP_PASSWORD_LENGTH} characters. Wraps your 256-bit Data Encryption Key with PBKDF2-SHA256 (600,000 iterations).
                </p>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="setup-master-password"
                      className="text-xs font-bold uppercase tracking-wider text-zinc-900"
                    >
                      Master Password
                    </label>
                    <span className="text-[11px] font-semibold text-zinc-900/75 tabular-nums">
                      {setupPassword.length} / {MIN_SETUP_PASSWORD_LENGTH}+ chars
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="setup-master-password"
                      type={showPassword ? 'text' : 'password'}
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Enter master password (8+ chars)..."
                      autoFocus
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-4 py-2.5 pr-11 text-sm font-medium text-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-950 p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Advisory 4-Bar Strength Meter */}
                <div
                  data-testid="password-strength-meter"
                  className="rounded-xl bg-white/65 border border-zinc-950/15 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="uppercase tracking-wider text-zinc-900/80">
                      Password Strength
                    </span>
                    <span data-testid="password-strength-label">
                      {setupPassword.length === 0 ? 'Enter 8+ chars' : strength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((barIdx) => (
                      <div
                        key={barIdx}
                        className={`h-2 rounded-full transition-colors ${getBarColorClass(
                          barIdx
                        )}`}
                      />
                    ))}
                  </div>
                  {strength.tips.length > 0 && (
                    <p className="text-[11px] text-zinc-800">
                      Tip: {strength.tips.slice(0, 2).join(' · ')}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="setup-confirm-password"
                    className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
                  >
                    Confirm Master Password
                  </label>
                  <input
                    id="setup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={setupPasswordConfirm}
                    onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                    placeholder="Re-enter master password..."
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-4 py-2.5 text-sm font-medium text-zinc-950"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="w-4 h-4 rounded accent-zinc-950"
                  />
                  <span>Show password</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSetupStep(1);
                      setSetupPinStage('enter');
                      setError('');
                    }}
                    className="rounded-xl border-2 border-zinc-950 px-4 py-3 text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white py-3 px-5 text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
                  >
                    <span>Next: Recovery Key</span>
                    <ArrowRight size={17} />
                  </button>
                </div>
              </form>
            )}

            {setupStep === 3 && (
              <form onSubmit={handleFinishSetupWizard} className="space-y-3.5">
                <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
                  SAVE YOUR RECOVERY KEY
                </h1>

                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-amber-950 text-amber-100 p-3 text-xs font-semibold"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-300" />
                  <span>
                    If you forget your PIN and password and lose this key, your data cannot be recovered.
                  </span>
                </div>

                <div
                  data-testid="generated-recovery-key"
                  className="rounded-2xl bg-zinc-950 text-white p-4 font-mono text-sm sm:text-base font-bold tracking-wider text-center select-all break-all"
                >
                  {generatedRecoveryKey}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyRecoveryKey(generatedRecoveryKey)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
                  >
                    {copiedRecovery ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedRecovery ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadRecoveryTxt(generatedRecoveryKey)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Download .txt</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintRecoveryKey}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Print</span>
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="confirm-recovery-last4"
                    className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
                  >
                    Type the last 4 characters ({generatedRecoveryKey.slice(-4)}) to confirm
                  </label>
                  <input
                    id="confirm-recovery-last4"
                    type="text"
                    maxLength={4}
                    value={recoveryLast4Input}
                    onChange={(e) => setRecoveryLast4Input(e.target.value.toUpperCase())}
                    placeholder="Last 4 characters..."
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-4 py-2.5 text-sm font-mono font-bold uppercase text-zinc-950"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white py-3.5 px-5 text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {loading ? 'Encrypting Vault...' : 'Confirm & Open Guardian Vault'}
                  </span>
                  <ArrowRight size={18} />
                </button>
              </form>
            )}
          </div>
        ) : unlockMode === 'post_recovery_key' ? (
          /* SHOW NEW RECOVERY KEY AFTER PASSWORD RESET */
          <div className="space-y-4">
            <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
              NEW RECOVERY KEY GENERATED
            </h1>
            <div className="rounded-xl bg-amber-950 text-amber-100 p-3 text-xs font-semibold">
              Your previous recovery key is now permanently deactivated. Save this new recovery key before continuing. If you forget your PIN and password and lose this key, your data cannot be recovered.
            </div>
            <div
              data-testid="new-recovery-key-display"
              className="rounded-2xl bg-zinc-950 text-white p-4 font-mono text-sm sm:text-base font-bold tracking-wider text-center select-all break-all"
            >
              {postResetRecoveryKey}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleCopyRecoveryKey(postResetRecoveryKey)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
              >
                {copiedRecovery ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedRecovery ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadRecoveryTxt(postResetRecoveryKey)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
              >
                <Download size={14} />
                <span>Download .txt</span>
              </button>
              <button
                type="button"
                onClick={handlePrintRecoveryKey}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 border-2 border-zinc-950/20 py-2 px-3 text-xs font-bold uppercase cursor-pointer"
              >
                <Printer size={14} />
                <span>Print</span>
              </button>
            </div>
            <div>
              <label
                htmlFor="post-reset-last4"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
              >
                Type the last 4 characters ({postResetRecoveryKey.slice(-4)}) to continue
              </label>
              <input
                id="post-reset-last4"
                type="text"
                maxLength={4}
                value={postResetLast4}
                onChange={(e) => setPostResetLast4(e.target.value.toUpperCase())}
                placeholder="Last 4 characters..."
                className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-4 py-2.5 text-sm font-mono font-bold uppercase text-zinc-950"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (
                  postResetLast4.trim().toUpperCase() !==
                  postResetRecoveryKey.slice(-4).toUpperCase()
                ) {
                  setError('Enter the last 4 characters of your new recovery key.');
                  return;
                }
                await onUnlockWithPin(resetNewPin);
              }}
              className="w-full rounded-xl bg-zinc-950 text-white py-3.5 px-5 text-sm font-bold uppercase tracking-wider cursor-pointer"
            >
              Continue to Guardian Vault
            </button>
          </div>
        ) : (
          /* UNLOCK SCREEN */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-zinc-950 text-white flex items-center justify-center">
                <Lock size={19} />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
                Guardian Vault Locked
              </span>
            </div>

            {unlockMode === 'pin' && (
              <>
                <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
                  ENTER 4-DIGIT PIN
                </h1>

                {isPinLockedOut ? (
                  <div
                    role="alert"
                    className="rounded-xl bg-red-950 text-red-100 p-3 text-xs font-semibold"
                  >
                    PIN is disabled after 5 wrong attempts. Please unlock with your master password.
                  </div>
                ) : (
                  <>
                    {cooldownRemainingSec > 0 && (
                      <div className="rounded-xl bg-amber-950 text-amber-100 px-3 py-2 text-xs font-semibold">
                        Too many wrong attempts. Wait {cooldownRemainingSec}s before next PIN attempt.
                      </div>
                    )}
                    {renderNumberPad(pinEntry, () => void submitPinUnlock(pinEntry))}
                  </>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-950/15 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode('password');
                    }}
                    className="underline hover:opacity-80 cursor-pointer"
                  >
                    Use password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode('forgot_pin');
                    }}
                    className="underline hover:opacity-80 cursor-pointer"
                  >
                    Forgot PIN?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode('forgot_password');
                    }}
                    className="underline hover:opacity-80 cursor-pointer"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setFreshConfirmStep(1);
                      setFreshDeleteInput('');
                      setUnlockMode('start_fresh');
                    }}
                    className="text-red-950 underline hover:opacity-80 cursor-pointer"
                  >
                    Start fresh
                  </button>
                </div>
              </>
            )}

            {unlockMode === 'password' && (
              <form onSubmit={handlePasswordUnlockSubmit} className="space-y-3.5">
                <h1 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none">
                  UNLOCK WITH PASSWORD
                </h1>
                {isPinLockedOut && (
                  <p className="text-xs font-semibold text-red-950">
                    PIN is disabled after 5 wrong attempts. Enter your master password to unlock and re-enable PIN access.
                  </p>
                )}

                <div>
                  <label
                    htmlFor="unlock-password-input"
                    className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
                  >
                    Master Password
                  </label>
                  <div className="relative">
                    <input
                      id="unlock-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordEntry}
                      onChange={(e) => setPasswordEntry(e.target.value)}
                      placeholder="Enter master password..."
                      autoFocus
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-4 py-2.5 pr-11 text-sm font-medium text-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-950 p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white py-3.5 px-5 text-sm font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                >
                  <span>{loading ? 'Unlocking...' : 'Unlock Vault'}</span>
                  <ArrowRight size={18} />
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-950/15 text-xs font-bold">
                  {!isLegacy && !isPinLockedOut && (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setUnlockMode('pin');
                      }}
                      className="underline cursor-pointer"
                    >
                      Use 4-digit PIN
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode('forgot_pin');
                    }}
                    className="underline cursor-pointer"
                  >
                    Forgot PIN?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode('forgot_password');
                    }}
                    className="underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setFreshConfirmStep(1);
                      setFreshDeleteInput('');
                      setUnlockMode('start_fresh');
                    }}
                    className="text-red-950 underline cursor-pointer"
                  >
                    Start fresh
                  </button>
                </div>
              </form>
            )}

            {unlockMode === 'forgot_pin' && (
              <form onSubmit={handleForgotPinSubmit} className="space-y-3">
                <h1 className="font-anton text-3xl uppercase tracking-tight text-zinc-950 leading-none">
                  RESET 4-DIGIT PIN
                </h1>
                <p className="text-xs text-zinc-900/80">
                  Verify your master password to set a new 4-digit PIN. All vault records remain untouched.
                </p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                    Master Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={forgotPinPassword}
                    onChange={(e) => setForgotPinPassword(e.target.value)}
                    placeholder="Enter master password..."
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm text-zinc-950"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      New 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) =>
                        setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="4 digits"
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm font-mono text-zinc-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPinConfirm}
                      onChange={(e) =>
                        setNewPinConfirm(
                          e.target.value.replace(/\D/g, '').slice(0, 4)
                        )
                      }
                      placeholder="4 digits"
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm font-mono text-zinc-950"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode(isPinLockedOut ? 'password' : 'pin');
                    }}
                    className="rounded-xl border-2 border-zinc-950 px-4 py-2.5 text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-zinc-950 text-white py-2.5 px-4 text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {loading ? 'Updating PIN...' : 'Save New PIN & Unlock'}
                  </button>
                </div>
              </form>
            )}

            {unlockMode === 'forgot_password' && (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                <h1 className="font-anton text-3xl uppercase tracking-tight text-zinc-950 leading-none">
                  RECOVERY KEY RESET
                </h1>
                <p className="text-xs text-zinc-900/80">
                  Enter your 24-character recovery key to set a new master password and PIN. Your encrypted vault data stays 100% intact.
                </p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                    Recovery Key (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
                  </label>
                  <input
                    type="text"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-xs font-mono font-bold uppercase text-zinc-950"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      New Password (8+ chars)
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="New password..."
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs text-zinc-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={resetNewPasswordConfirm}
                      onChange={(e) => setResetNewPasswordConfirm(e.target.value)}
                      placeholder="Confirm password..."
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs text-zinc-950"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      New 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={resetNewPin}
                      onChange={(e) =>
                        setResetNewPin(
                          e.target.value.replace(/\D/g, '').slice(0, 4)
                        )
                      }
                      placeholder="4 digits"
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs font-mono text-zinc-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={resetNewPinConfirm}
                      onChange={(e) =>
                        setResetNewPinConfirm(
                          e.target.value.replace(/\D/g, '').slice(0, 4)
                        )
                      }
                      placeholder="4 digits"
                      className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs font-mono text-zinc-950"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setUnlockMode(isPinLockedOut ? 'password' : 'pin');
                    }}
                    className="rounded-xl border-2 border-zinc-950 px-4 py-2.5 text-xs font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-zinc-950 text-white py-2.5 px-4 text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {loading ? 'Re-Wrapping Key...' : 'Reset Password & PIN'}
                  </button>
                </div>
              </form>
            )}

            {unlockMode === 'start_fresh' && (
              <div className="space-y-3.5">
                <h1 className="font-anton text-3xl uppercase tracking-tight text-red-950 leading-none">
                  START FRESH (WIPE VAULT)
                </h1>
                {freshConfirmStep === 1 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-zinc-900">
                      Confirmation 1 of 2: Are you sure you want to permanently erase all encrypted items in GuardianVaultDB?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUnlockMode('pin')}
                        className="flex-1 rounded-xl border-2 border-zinc-950 py-2.5 text-xs font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setFreshConfirmStep(2)}
                        className="flex-1 rounded-xl bg-red-950 text-white py-2.5 text-xs font-bold uppercase cursor-pointer"
                      >
                        Yes, Continue
                      </button>
                    </div>
                  </div>
                )}

                {freshConfirmStep === 2 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-zinc-900">
                      Confirmation 2 of 2: This action cannot be undone unless you have a .vault backup file. Proceed to final confirmation?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUnlockMode('pin')}
                        className="flex-1 rounded-xl border-2 border-zinc-950 py-2.5 text-xs font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setFreshConfirmStep(3)}
                        className="flex-1 rounded-xl bg-red-950 text-white py-2.5 text-xs font-bold uppercase cursor-pointer"
                      >
                        Proceed to Type DELETE
                      </button>
                    </div>
                  </div>
                )}

                {freshConfirmStep === 3 && (
                  <form onSubmit={handleStartFreshSubmit} className="space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-red-950">
                      Type DELETE in uppercase to wipe GuardianVaultDB
                    </label>
                    <input
                      type="text"
                      value={freshDeleteInput}
                      onChange={(e) => setFreshDeleteInput(e.target.value)}
                      placeholder="Type DELETE"
                      className="w-full rounded-xl bg-white border-2 border-red-950 px-3.5 py-2 text-xs font-mono font-bold text-zinc-950"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUnlockMode('pin')}
                        className="rounded-xl border-2 border-zinc-950 px-4 py-2.5 text-xs font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading || freshDeleteInput.trim() !== 'DELETE'}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-700 text-white py-2.5 px-4 text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 size={14} />
                        <span>Wipe GuardianVaultDB</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-xl bg-red-950/90 text-red-100 px-3.5 py-2.5 text-xs font-medium flex items-center justify-between gap-2"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 4 Interactive Characters Peeking from the Bottom */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex items-end justify-center gap-2 sm:gap-8 px-4 overflow-hidden h-44 sm:h-60 pointer-events-none"
      >
        {SECTIONS.map((sec, i) => {
          const isSelected = i === selectedSectionIndex % 4;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setSelectedSectionIndex(i)}
              aria-label={`Switch lock screen theme to ${sec.name} character`}
              title={`Switch theme: ${sec.name}`}
              className="pointer-events-auto relative w-24 sm:w-40 h-44 sm:h-60 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-t-3xl"
              style={{
                zIndex: isSelected ? 25 : 15,
                transform: isSelected
                  ? 'translateY(10px) scale(1.12)'
                  : 'translateY(36px) scale(0.92)',
                filter: isSelected
                  ? 'drop-shadow(0 10px 15px rgba(0,0,0,0.35))'
                  : 'opacity(0.85)',
              }}
            >
              <img
                src={sec.image}
                alt={sec.name}
                draggable={false}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain object-bottom hover:scale-105 active:scale-95 transition-transform"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
