import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  Upload,
  HardDrive,
  FileCode,
  Shield,
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  Copy,
  ClipboardPaste,
  QrCode,
  CheckSquare,
  Square,
  Lock,
  Sparkles,
  Camera,
} from 'lucide-react';
import {
  DecryptedVaultPayload,
  DuplicateStrategy,
  ImportExecutionReport,
  ImportPreviewAnalysis,
  VaultCollection,
  VaultItem,
  VaultTag,
} from '../types/vault';
import { encryptVaultFileWithPassword } from '../crypto/webCrypto';
import { generateStandaloneHtml, isBackupOverdue } from '../utils/vaultLogic';
import {
  MAX_QR_TRANSFER_ITEMS,
  copyItemsToUniversalClipboard,
  encodeQrTransferString,
  encryptUniversalGvault,
  isTransferInputEncrypted,
  parseAndAnalyzeTransferInput,
  resolveSelectiveImport,
  serializeToUniversalGvault,
} from '../utils/universalTransfer';
import { SECTIONS } from '../constants/sections';

export type PortabilityTab = 'export' | 'import' | 'qr';

interface PortabilityModalProps {
  isOpen: boolean;
  initialTab?: PortabilityTab;
  activeSectionIndex: number;
  items: VaultItem[];
  selectedItemIds: string[];
  collections: VaultCollection[];
  tags: VaultTag[];
  lastBackupAt?: string;
  onClose: () => void;
  onApplySelectiveImport: (
    nextItems: VaultItem[],
    itemsToPersist: VaultItem[],
    importedCollections: VaultCollection[],
    importedTags: VaultTag[]
  ) => Promise<void>;
  onRecordBackup: () => Promise<void>;
  onToast: (msg: string) => void;
}

export const PortabilityModal: React.FC<PortabilityModalProps> = ({
  isOpen,
  initialTab = 'export',
  activeSectionIndex,
  items,
  selectedItemIds,
  collections,
  tags,
  lastBackupAt,
  onClose,
  onApplySelectiveImport,
  onRecordBackup,
  onToast,
}) => {
  const [tab, setTab] = useState<PortabilityTab>(initialTab);
  const [exportScope, setExportScope] = useState<
    'all' | 'collection' | 'selected'
  >(() => (selectedItemIds.length > 0 ? 'selected' : 'all'));
  const [exportCollectionId, setExportCollectionId] = useState(
    collections[0]?.id || 'col-general'
  );
  const [exportFormat, setExportFormat] = useState<
    'gvault' | 'vault' | 'html'
  >('gvault');
  const [encryptGvaultExport, setEncryptGvaultExport] = useState(false);
  const [vaultFilePassword, setVaultFilePassword] = useState('');
  const [manualCopyJson, setManualCopyJson] = useState('');

  // Paste & Import state
  const [pendingImportText, setPendingImportText] = useState('');
  const [pendingImportSourceLabel, setPendingImportSourceLabel] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [showManualPasteBox, setShowManualPasteBox] = useState(false);
  const [previewAnalysis, setPreviewAnalysis] =
    useState<ImportPreviewAnalysis | null>(null);
  const [selectedCandidateIndices, setSelectedCandidateIndices] = useState<
    Set<number>
  >(new Set());
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>('skip');
  const [explicitReplaceConfirmed, setExplicitReplaceConfirmed] =
    useState(false);
  const [lastImportReport, setLastImportReport] =
    useState<ImportExecutionReport | null>(null);

  // QR Transfer state
  const [qrMode, setQrMode] = useState<'send' | 'receive'>('send');
  const [qrPassword, setQrPassword] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrEncodedString, setQrEncodedString] = useState('');
  const [qrScanInput, setQrScanInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      if (selectedItemIds.length > 0) {
        setExportScope('selected');
      }
      setError('');
      setLastImportReport(null);
    } else {
      stopCameraStream();
    }
  }, [isOpen, initialTab, selectedItemIds.length]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const getScopedItems = (): VaultItem[] => {
    const nonTrashed = items.filter((i) => !i.trashed);
    if (exportScope === 'selected' && selectedItemIds.length > 0) {
      const idSet = new Set(selectedItemIds);
      return nonTrashed.filter((i) => idSet.has(i.id));
    }
    if (exportScope === 'collection') {
      return nonTrashed.filter((i) => i.collectionId === exportCollectionId);
    }
    return nonTrashed;
  };

  // Generate QR code when in QR Send mode
  useEffect(() => {
    if (!isOpen || tab !== 'qr' || qrMode !== 'send') return;
    let active = true;
    const scoped = getScopedItems().slice(0, MAX_QR_TRANSFER_ITEMS);
    if (scoped.length === 0) {
      setQrDataUrl('');
      setQrEncodedString('');
      return;
    }
    (async () => {
      try {
        const str = await encodeQrTransferString(
          scoped,
          qrPassword.trim() || undefined
        );
        if (!active) return;
        setQrEncodedString(str);
        const url = await QRCode.toDataURL(str, {
          width: 260,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#18181b', light: '#ffffff' },
        });
        if (active) setQrDataUrl(url);
      } catch (err) {
        if (active) {
          setQrDataUrl('');
          setError(
            err instanceof Error ? err.message : 'Failed to generate QR code.'
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    isOpen,
    tab,
    qrMode,
    qrPassword,
    exportScope,
    exportCollectionId,
    selectedItemIds,
    items,
  ]);

  if (!isOpen) return null;

  const section = SECTIONS[activeSectionIndex % 4] || SECTIONS[0];
  const overdue = isBackupOverdue(lastBackupAt);
  const supportsFileSystemAccess =
    typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  const scopedItems = getScopedItems();

  const buildExportContent = async (): Promise<{
    content: string;
    filename: string;
    mime: string;
  }> => {
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (exportFormat === 'gvault') {
      if (encryptGvaultExport) {
        if (!vaultFilePassword.trim() || vaultFilePassword.length < 4) {
          throw new Error(
            'Enter an export password (min 4 characters) to encrypt the .gvault file.'
          );
        }
        const encryptedGvault = await encryptUniversalGvault(
          scopedItems,
          vaultFilePassword,
          collections,
          tags
        );
        return {
          content: JSON.stringify(encryptedGvault, null, 2),
          filename: `guardian-transfer-${dateStamp}.gvault`,
          mime: 'application/vnd.guardianvault+json',
        };
      }
      const gvaultJson = await serializeToUniversalGvault(
        scopedItems,
        collections,
        tags
      );
      return {
        content: gvaultJson,
        filename: `guardian-transfer-${dateStamp}.gvault`,
        mime: 'application/vnd.guardianvault+json',
      };
    }

    if (exportFormat === 'vault') {
      if (!vaultFilePassword.trim() || vaultFilePassword.length < 4) {
        throw new Error(
          'Enter an encryption password (min 4 chars) to protect the .vault archive.'
        );
      }
      const payload: DecryptedVaultPayload = {
        version: 3,
        exportedAt: new Date().toISOString(),
        items: scopedItems,
        collections,
        tags,
      };
      const encrypted = await encryptVaultFileWithPassword(
        payload,
        vaultFilePassword
      );
      return {
        content: JSON.stringify(encrypted, null, 2),
        filename: `guardian-vault-${dateStamp}.vault`,
        mime: 'application/json',
      };
    }

    const html = generateStandaloneHtml(
      scopedItems,
      collections,
      'Guardian Vault — Portable Archive'
    );
    return {
      content: html,
      filename: `guardian-vault-${dateStamp}.html`,
      mime: 'text/html',
    };
  };

  const handleCopyScopedToClipboard = async () => {
    setError('');
    setManualCopyJson('');
    if (scopedItems.length === 0) {
      setError('No items in the selected scope to copy.');
      return;
    }
    setBusy(true);
    try {
      const res = await copyItemsToUniversalClipboard(
        scopedItems,
        collections,
        tags
      );
      onToast(
        `${res.itemCount} item(s) copied to universal clipboard (.gvault + URLs). Switch devices and paste to transfer.`
      );
    } catch (err) {
      // Fallback: show JSON in text box for manual copy if clipboard access is blocked
      try {
        const json = await serializeToUniversalGvault(
          scopedItems,
          collections,
          tags
        );
        setManualCopyJson(json);
      } catch {
        // ignore
      }
      setError(
        err instanceof Error
          ? err.message
          : 'System clipboard restricted — copy the transfer JSON manually below.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadExport = async (usePendrivePicker = false) => {
    setError('');
    if (scopedItems.length === 0) {
      setError('No items available in the selected export scope.');
      return;
    }
    setBusy(true);
    try {
      const { content, filename, mime } = await buildExportContent();

      if (
        usePendrivePicker &&
        typeof window !== 'undefined' &&
        'showSaveFilePicker' in window
      ) {
        const picker = (
          window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<{
              createWritable: () => Promise<{
                write: (data: string) => Promise<void>;
                close: () => Promise<void>;
              }>;
            }>;
          }
        ).showSaveFilePicker;
        const handle = await picker({
          suggestedName: filename,
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      await onRecordBackup();
      onToast(
        exportFormat === 'gvault' && encryptGvaultExport
          ? `Exported ${filename}. Password required to import on another device.`
          : `Exported ${filename} (${scopedItems.length} items) successfully.`
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const runPreviewAnalysis = async (
    rawText: string,
    sourceLabel: string,
    passwordOverride?: string
  ) => {
    setError('');
    setLastImportReport(null);
    setPendingImportText(rawText);
    setPendingImportSourceLabel(sourceLabel);

    const effectivePassword =
      passwordOverride !== undefined ? passwordOverride : importPassword;

    if (isTransferInputEncrypted(rawText) && !effectivePassword.trim()) {
      setPreviewAnalysis(null);
      return;
    }

    setBusy(true);
    try {
      const analysis = await parseAndAnalyzeTransferInput(
        rawText,
        items,
        collections,
        effectivePassword.trim() || undefined
      );
      setPreviewAnalysis(analysis);
      setShowManualPasteBox(false);

      // By default, select all valid ('new' and 'duplicate') candidates
      const initialSelected = new Set<number>();
      for (const c of analysis.candidates) {
        if (c.status === 'new' || c.status === 'duplicate') {
          initialSelected.add(c.index);
        }
      }
      setSelectedCandidateIndices(initialSelected);
    } catch (err) {
      setPreviewAnalysis(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Import failed: invalid or corrupted transfer data.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePasteFromSystemClipboard = async () => {
    setError('');
    setLastImportReport(null);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setShowManualPasteBox(true);
      setError(
        'Direct clipboard read is restricted by this browser/OS. Paste into the text box below (Ctrl+V / Cmd+V).'
      );
      return;
    }

    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        setShowManualPasteBox(true);
        setError(
          'System clipboard is empty. Copy items from Guardian Vault first or paste manually below.'
        );
        return;
      }
      await runPreviewAnalysis(clipText, 'System Clipboard');
    } catch {
      setShowManualPasteBox(true);
      setError(
        'Clipboard permission was denied or blocked by OS. Paste your copied data into the box below.'
      );
    }
  };

  const handleFileSelected = async (file: File) => {
    setError('');
    setLastImportReport(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds maximum safe import limit (10 MB).');
      return;
    }
    const text = await file.text();
    await runPreviewAnalysis(text, file.name);
  };

  const handleOpenFromPendrive = async () => {
    setError('');
    try {
      if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
        const picker = (
          window as unknown as {
            showOpenFilePicker: () => Promise<
              Array<{ getFile: () => Promise<File> }>
            >;
          }
        ).showOpenFilePicker;
        const [handle] = await picker();
        if (handle) {
          const file = await handle.getFile();
          await handleFileSelected(file);
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Could not open file from disk.');
    }
  };

  const handleToggleCandidate = (idx: number) => {
    setSelectedCandidateIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectOnlyNew = () => {
    if (!previewAnalysis) return;
    const next = new Set<number>();
    for (const c of previewAnalysis.candidates) {
      if (c.status === 'new') next.add(c.index);
    }
    setSelectedCandidateIndices(next);
  };

  const handleSelectAllValid = () => {
    if (!previewAnalysis) return;
    const next = new Set<number>();
    for (const c of previewAnalysis.candidates) {
      if (c.status === 'new' || c.status === 'duplicate') next.add(c.index);
    }
    setSelectedCandidateIndices(next);
  };

  const executeConfirmedImport = async () => {
    setError('');
    if (!previewAnalysis) {
      setError('Preview transfer data before importing.');
      return;
    }
    if (selectedCandidateIndices.size === 0) {
      setError('Select at least one record to import.');
      return;
    }
    if (duplicateStrategy === 'replace' && !explicitReplaceConfirmed) {
      setError(
        'Please check the confirmation box to allow replacing existing vault records.'
      );
      return;
    }

    setBusy(true);
    try {
      const { nextItems, itemsToPersist, report } = resolveSelectiveImport(
        previewAnalysis,
        items,
        selectedCandidateIndices,
        duplicateStrategy,
        explicitReplaceConfirmed
      );

      await onApplySelectiveImport(
        nextItems,
        itemsToPersist,
        previewAnalysis.collections,
        previewAnalysis.tags
      );

      setLastImportReport(report);
      onToast(
        `Transfer complete: ${report.importedCount} imported (${report.newImportedCount} new, ${report.replacedCount} replaced, ${report.keptBothCount} kept both, ${report.skippedDuplicatesCount} skipped).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import items.');
    } finally {
      setBusy(false);
    }
  };

  const startCameraQrScanner = async () => {
    setError('');
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        'Camera access is not available on this device/browser. Paste the QR transfer code below instead.'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // If BarcodeDetector is supported in browser, poll frames
      if ('BarcodeDetector' in window) {
        const DetectorClass = (
          window as unknown as {
            BarcodeDetector: new (opts: { formats: string[] }) => {
              detect: (
                source: HTMLVideoElement
              ) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        const detector = new DetectorClass({ formats: ['qr_code'] });
        const interval = window.setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            window.clearInterval(interval);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const rawVal = barcodes[0].rawValue;
              window.clearInterval(interval);
              stopCameraStream();
              setQrScanInput(rawVal);
              setTab('import');
              await runPreviewAnalysis(rawVal, 'Scanned QR Code');
            }
          } catch {
            // continue scanning
          }
        }, 450);
      }
    } catch {
      setError(
        'Camera permission denied or unavailable. Paste the QR transfer string below.'
      );
    }
  };

  const isPendingEncrypted =
    Boolean(pendingImportText) && isTransferInputEncrypted(pendingImportText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Universal Vault Transfer: Copy, Paste, Export and Import"
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border-2 border-zinc-950 p-5 sm:p-7 text-zinc-950 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
        style={{ backgroundColor: section.panel }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
              Cross-Platform Universal Transfer (.gvault)
            </span>
            <h2 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight leading-none mt-0.5">
              COPY, PASTE, EXPORT &amp; IMPORT
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transfer modal"
            className="w-10 h-10 rounded-full border-2 border-zinc-950 flex items-center justify-center hover:bg-black/10 cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* 7-Day Backup Status Banner */}
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl p-3 mb-4 text-xs font-semibold ${
            overdue
              ? 'bg-amber-950 text-amber-100'
              : 'bg-zinc-950/90 text-white'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CalendarClock size={17} className="shrink-0" />
            <div>
              <div>
                {overdue
                  ? '7-Day Backup Reminder: Export a .gvault or .vault backup to keep your offline vault safe'
                  : 'Universal Transfer Ready: Works offline across Windows, Linux, macOS, Android & iOS'}
              </div>
              <div className="opacity-80 font-normal">
                Last backup:{' '}
                {lastBackupAt
                  ? new Date(lastBackupAt).toLocaleString()
                  : 'Never backed up'}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Mode Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-black/15 mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('export');
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              tab === 'export'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-900 hover:bg-black/10'
            }`}
          >
            <Download size={14} />
            <span>Copy &amp; Export</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('import');
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              tab === 'import'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-900 hover:bg-black/10'
            }`}
          >
            <ClipboardPaste size={14} />
            <span>Paste &amp; Import</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('qr');
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              tab === 'qr'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-900 hover:bg-black/10'
            }`}
          >
            <QrCode size={14} />
            <span>QR Transfer</span>
          </button>
        </div>

        {/* TAB 1: COPY & EXPORT */}
        {tab === 'export' && (
          <div className="space-y-4">
            {/* 1. Scope Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1.5">
                1. Select What to Copy or Export
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                    exportScope === 'all'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/80 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  All Saved Items ({items.filter((i) => !i.trashed).length})
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope('collection')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                    exportScope === 'collection'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/80 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  Entire Collection / Folder
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope('selected')}
                  disabled={selectedItemIds.length === 0}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 cursor-pointer disabled:opacity-40 ${
                    exportScope === 'selected'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/80 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  Selected Items ({selectedItemIds.length})
                </button>
              </div>
              {exportScope === 'collection' && (
                <select
                  aria-label="Select collection to export"
                  value={exportCollectionId}
                  onChange={(e) => setExportCollectionId(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm font-semibold text-zinc-950"
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (
                      {
                        items.filter(
                          (i) => !i.trashed && i.collectionId === c.id
                        ).length
                      }{' '}
                      items)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Universal Clipboard Copy Card */}
            <div className="rounded-2xl bg-white/85 border-2 border-zinc-950 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-950 flex items-center gap-1.5">
                  <Copy size={14} />
                  <span>Universal Clipboard Copy ({scopedItems.length} items)</span>
                </div>
                <p className="text-xs text-zinc-800 mt-0.5">
                  Copies portable <code>.gvault</code> JSON + plain-text URLs.
                  Paste directly into Guardian Vault on any OS.
                </p>
              </div>
              <button
                type="button"
                disabled={busy || scopedItems.length === 0}
                onClick={handleCopyScopedToClipboard}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-40 cursor-pointer shrink-0"
              >
                <Copy size={14} />
                <span>Copy {scopedItems.length} Item(s)</span>
              </button>
            </div>

            {manualCopyJson && (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-3">
                <label className="block text-xs font-bold uppercase mb-1">
                  Manual Clipboard Fallback (Select All &amp; Copy):
                </label>
                <textarea
                  readOnly
                  value={manualCopyJson}
                  rows={4}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-xl bg-zinc-100 p-2 font-mono text-xs text-zinc-950"
                />
              </div>
            )}

            {/* 2. Export File Format */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1.5">
                2. Portable Export File Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setExportFormat('gvault')}
                  className={`p-3 rounded-2xl text-left border-2 cursor-pointer ${
                    exportFormat === 'gvault'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/85 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase">
                    <Sparkles size={14} />
                    <span>Universal .gvault</span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    Cross-OS transfer file (Plain or AES-256-GCM Encrypted)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('vault')}
                  className={`p-3 rounded-2xl text-left border-2 cursor-pointer ${
                    exportFormat === 'vault'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/85 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase">
                    <Shield size={14} />
                    <span>Encrypted .vault</span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    Full AES-256-GCM encrypted backup archive
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('html')}
                  className={`p-3 rounded-2xl text-left border-2 cursor-pointer ${
                    exportFormat === 'html'
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white/85 text-zinc-950 border-zinc-950/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase">
                    <FileCode size={14} />
                    <span>Read-Only HTML</span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    Zero-install standalone webpage archive
                  </p>
                </button>
              </div>
            </div>

            {/* Optional Encryption Toggle for .gvault */}
            {exportFormat === 'gvault' && (
              <div className="rounded-2xl bg-white/80 border-2 border-zinc-950/20 p-3.5 space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-zinc-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={encryptGvaultExport}
                    onChange={(e) => setEncryptGvaultExport(e.target.checked)}
                    className="w-4 h-4 accent-zinc-950"
                  />
                  <Lock size={14} />
                  <span>
                    Password-Protect .gvault File (AES-256-GCM Authenticated
                    Encryption)
                  </span>
                </label>
                {encryptGvaultExport && (
                  <div>
                    <input
                      id="gvault-export-password"
                      type="password"
                      value={vaultFilePassword}
                      onChange={(e) => setVaultFilePassword(e.target.value)}
                      placeholder="Enter export password (required when importing on destination device)..."
                      className="w-full rounded-xl bg-white border-2 border-zinc-950/30 px-3.5 py-2 text-sm font-medium text-zinc-950"
                    />
                    <p className="text-[11px] text-zinc-700 mt-1">
                      Note: Master keys and PINs are never exported. You will
                      enter this export password on the receiving computer.
                    </p>
                  </div>
                )}
              </div>
            )}

            {exportFormat === 'vault' && (
              <div>
                <label
                  htmlFor="vault-export-password"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
                >
                  Password for .vault File (AES-256-GCM + PBKDF2 600,000 Iterations)
                </label>
                <input
                  id="vault-export-password"
                  type="password"
                  value={vaultFilePassword}
                  onChange={(e) => setVaultFilePassword(e.target.value)}
                  placeholder="Enter password to encrypt this .vault export..."
                  className="w-full rounded-xl bg-white/95 border-2 border-zinc-950/20 px-3.5 py-2.5 text-sm font-medium text-zinc-950"
                />
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-950 text-red-100 px-3.5 py-2.5 text-xs font-medium flex items-center gap-2"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-zinc-950/15">
              {supportsFileSystemAccess && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDownloadExport(true)}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-zinc-950 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-950 hover:bg-zinc-100 cursor-pointer"
                >
                  <HardDrive size={15} />
                  <span>Save Directly to USB / Disk</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDownloadExport(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
              >
                <Download size={15} />
                <span>
                  {busy
                    ? 'Generating...'
                    : `Download .${exportFormat} File (${scopedItems.length})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PASTE & IMPORT WITH PREVIEW & DUPLICATE MANAGER */}
        {tab === 'import' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".gvault,.vault,.json,.html,.htm,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
              }}
              className="hidden"
            />

            {/* Source Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={handlePasteFromSystemClipboard}
                className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-white py-3 px-4 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer shadow-md"
              >
                <ClipboardPaste size={16} />
                <span>Paste from Clipboard</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-zinc-950 bg-white text-zinc-950 py-3 px-4 text-xs font-bold uppercase tracking-wider hover:bg-zinc-100 cursor-pointer"
              >
                <Upload size={16} />
                <span>Import File (.gvault / .vault)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualPasteBox((v) => !v)}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-zinc-950/40 bg-white/75 text-zinc-950 py-3 px-4 text-xs font-bold uppercase tracking-wider hover:bg-white cursor-pointer"
              >
                <FileCode size={16} />
                <span>
                  {showManualPasteBox ? 'Hide Text Box' : 'Paste Text / URLs'}
                </span>
              </button>
            </div>

            {supportsFileSystemAccess && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleOpenFromPendrive}
                  className="inline-flex items-center gap-1.5 text-xs font-bold underline text-zinc-900 cursor-pointer"
                >
                  <HardDrive size={13} />
                  <span>Open .gvault or .vault directly from USB Pendrive</span>
                </button>
              </div>
            )}

            {/* Manual Paste Textarea (Fallback or Direct Paste) */}
            {showManualPasteBox && (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-3.5 space-y-2.5">
                <label
                  htmlFor="manual-transfer-paste"
                  className="block text-xs font-bold uppercase tracking-wider text-zinc-950"
                >
                  Paste .gvault JSON, Clipboard Data, or Plain-Text URLs (One per line):
                </label>
                <textarea
                  id="manual-transfer-paste"
                  value={pendingImportText}
                  onChange={(e) => setPendingImportText(e.target.value)}
                  rows={4}
                  placeholder='Paste Guardian Vault transfer JSON, QR string (GVQR1:...), or https:// URLs here...'
                  className="w-full rounded-xl bg-zinc-50 border border-zinc-950/30 p-2.5 font-mono text-xs text-zinc-950"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      runPreviewAnalysis(
                        pendingImportText,
                        'Manual Pasted Data'
                      )
                    }
                    className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Validate &amp; Preview Items
                  </button>
                </div>
              </div>
            )}

            {/* Encrypted File Password Prompt */}
            {isPendingEncrypted && (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-950">
                  <Lock size={15} />
                  <span>
                    Password Required for Encrypted Transfer (
                    {pendingImportSourceLabel || 'Encrypted Data'})
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    aria-label="Export password for encrypted file"
                    type="password"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    placeholder="Enter the export password used when creating this transfer..."
                    className="flex-1 rounded-xl bg-white border-2 border-zinc-950/30 px-3.5 py-2 text-sm text-zinc-950"
                  />
                  <button
                    type="button"
                    disabled={busy || !importPassword.trim()}
                    onClick={() =>
                      runPreviewAnalysis(
                        pendingImportText,
                        pendingImportSourceLabel || 'Encrypted Transfer',
                        importPassword
                      )
                    }
                    className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    Decrypt &amp; Preview
                  </button>
                </div>
              </div>
            )}

            {/* Import Preview & Duplicate Management Panel */}
            {previewAnalysis && (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/15 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-700">
                      Source: {previewAnalysis.sourceFormat} (
                      {pendingImportSourceLabel})
                    </span>
                    <h3 className="font-anton text-xl uppercase tracking-tight text-zinc-950">
                      IMPORT PREVIEW ({previewAnalysis.totalDetected} DETECTED)
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectOnlyNew}
                      className="rounded-lg bg-zinc-950 text-white px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer"
                    >
                      Select Only New ({previewAnalysis.newCount})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllValid}
                      className="rounded-lg border border-zinc-950 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-950 cursor-pointer"
                    >
                      Select All ({previewAnalysis.newCount + previewAnalysis.duplicateCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCandidateIndices(new Set())}
                      className="rounded-lg border border-zinc-950/30 px-2.5 py-1 text-[11px] font-bold uppercase text-zinc-800 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Breakdown Stat Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                  <div className="rounded-xl bg-zinc-950/5 p-2.5 border border-zinc-950/15">
                    <div className="text-[10px] uppercase opacity-70">
                      Links &amp; Repos
                    </div>
                    <div className="text-sm mt-0.5">
                      {previewAnalysis.linkCount} Links ·{' '}
                      {previewAnalysis.repoCount} Repos
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-950/10 p-2.5 border border-emerald-900/20 text-emerald-950">
                    <div className="text-[10px] uppercase opacity-75">
                      New Records
                    </div>
                    <div className="text-sm mt-0.5">
                      {previewAnalysis.newCount} New
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-950/10 p-2.5 border border-amber-900/20 text-amber-950">
                    <div className="text-[10px] uppercase opacity-75">
                      Existing Duplicates
                    </div>
                    <div className="text-sm mt-0.5">
                      {previewAnalysis.duplicateCount} Duplicates
                    </div>
                  </div>
                  <div className="rounded-xl bg-red-950/10 p-2.5 border border-red-900/20 text-red-950">
                    <div className="text-[10px] uppercase opacity-75">
                      Invalid / Unsupported
                    </div>
                    <div className="text-sm mt-0.5">
                      {previewAnalysis.invalidCount} Invalid ·{' '}
                      {previewAnalysis.unsupportedCount} Unsupported
                    </div>
                  </div>
                </div>

                {/* Candidate Items List with Checkboxes */}
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {previewAnalysis.candidates.map((cand) => {
                    const isChecked = selectedCandidateIndices.has(cand.index);
                    const isSelectable =
                      cand.status === 'new' || cand.status === 'duplicate';
                    return (
                      <div
                        key={cand.index}
                        onClick={() => {
                          if (isSelectable) handleToggleCandidate(cand.index);
                        }}
                        className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border text-xs ${
                          isSelectable
                            ? 'cursor-pointer hover:bg-zinc-950/5'
                            : 'opacity-60 bg-red-950/5'
                        } ${
                          isChecked
                            ? 'border-zinc-950 bg-white'
                            : 'border-zinc-950/15 bg-white/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isSelectable ? (
                            <button
                              type="button"
                              aria-label={`Toggle import for ${cand.item.title}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCandidate(cand.index);
                              }}
                              className="text-zinc-950 shrink-0 cursor-pointer"
                            >
                              {isChecked ? (
                                <CheckSquare size={16} />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          ) : (
                            <AlertCircle
                              size={16}
                              className="text-red-700 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-950 truncate">
                              {cand.item.title}
                            </div>
                            <div className="text-[11px] text-zinc-700 truncate">
                              {cand.item.type === 'github'
                                ? 'GitHub Repository'
                                : cand.item.type.toUpperCase()}
                              {cand.item.url ? ` · ${cand.item.url}` : ''}
                              {cand.item.tags.length > 0
                                ? ` · #${cand.item.tags.join(' #')}`
                                : ''}
                            </div>
                            {cand.reason && (
                              <div className="text-[11px] font-semibold text-amber-900 mt-0.5">
                                {cand.reason}
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase shrink-0 ${
                            cand.status === 'new'
                              ? 'bg-emerald-900 text-white'
                              : cand.status === 'duplicate'
                              ? 'bg-amber-400 text-zinc-950'
                              : 'bg-red-900 text-white'
                          }`}
                        >
                          {cand.status === 'duplicate'
                            ? `DUPLICATE (${cand.duplicateMatchBy?.toUpperCase()})`
                            : cand.status.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Conflict & Duplicate Resolution Strategy */}
                <div className="pt-2 border-t border-zinc-950/15 space-y-2.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900">
                    Duplicate Conflict Resolution (Matched by Normalized URL or
                    Stable ID)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'skip',
                          label: 'Skip Duplicates (Safe)',
                        },
                        {
                          id: 'keep_both',
                          label: 'Keep Both Versions',
                        },
                        {
                          id: 'replace',
                          label: 'Replace Existing',
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDuplicateStrategy(opt.id);
                          if (opt.id !== 'replace') {
                            setExplicitReplaceConfirmed(false);
                          }
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                          duplicateStrategy === opt.id
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-white text-zinc-950 border-zinc-950/20'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {duplicateStrategy === 'replace' && (
                    <label className="flex items-center gap-2 rounded-xl bg-amber-400/30 border border-amber-900/30 p-2.5 text-xs font-bold text-zinc-950 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={explicitReplaceConfirmed}
                        onChange={(e) =>
                          setExplicitReplaceConfirmed(e.target.checked)
                        }
                        className="w-4 h-4 accent-zinc-950"
                      />
                      <span>
                        I explicitly confirm replacing matching existing records
                        in my vault with the imported versions.
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-zinc-800">
                    {selectedCandidateIndices.size} record(s) selected for import
                  </span>
                  <button
                    type="button"
                    disabled={busy || selectedCandidateIndices.size === 0}
                    onClick={executeConfirmedImport}
                    className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-40 cursor-pointer shadow-lg"
                  >
                    <CheckCircle2 size={15} />
                    <span>
                      {busy
                        ? 'Importing...'
                        : `Confirm & Import (${selectedCandidateIndices.size})`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Post-Import Execution Summary Report */}
            {lastImportReport && (
              <div
                role="status"
                className="rounded-2xl bg-emerald-950 text-emerald-100 p-4 text-xs space-y-1.5 border-2 border-zinc-950"
              >
                <div className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 size={17} />
                  <span>
                    Import Complete — {lastImportReport.importedCount} Item(s)
                    Added to Guardian Vault
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-emerald-200 font-semibold">
                  <div>New Imported: {lastImportReport.newImportedCount}</div>
                  <div>Replaced: {lastImportReport.replacedCount}</div>
                  <div>Kept Both: {lastImportReport.keptBothCount}</div>
                  <div>
                    Skipped Duplicates: {lastImportReport.skippedDuplicatesCount}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-950 text-red-100 px-3.5 py-2.5 text-xs font-medium flex items-center gap-2"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QR TRANSFER (SEND & SCAN FOR SMALL SETS) */}
        {tab === 'qr' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  stopCameraStream();
                  setQrMode('send');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase border-2 cursor-pointer ${
                  qrMode === 'send'
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white/80 text-zinc-950 border-zinc-950/20'
                }`}
              >
                Generate Transfer QR (Up to {MAX_QR_TRANSFER_ITEMS} Items)
              </button>
              <button
                type="button"
                onClick={() => setQrMode('receive')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase border-2 cursor-pointer ${
                  qrMode === 'receive'
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white/80 text-zinc-950 border-zinc-950/20'
                }`}
              >
                Scan / Receive Transfer QR
              </button>
            </div>

            {qrMode === 'send' ? (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {qrDataUrl ? (
                    <div className="bg-white p-3 rounded-2xl border-2 border-zinc-950 shrink-0">
                      <img
                        src={qrDataUrl}
                        alt="Guardian Vault Transfer QR Code"
                        className="w-52 h-52 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-52 h-52 rounded-2xl border-2 border-dashed border-zinc-950/30 flex items-center justify-center text-xs font-bold text-center p-4">
                      No items available to encode in QR.
                    </div>
                  )}

                  <div className="flex-1 space-y-3 w-full">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-zinc-950">
                        Encoding{' '}
                        {Math.min(scopedItems.length, MAX_QR_TRANSFER_ITEMS)} of{' '}
                        {scopedItems.length} item(s) in current scope
                      </div>
                      <p className="text-xs text-zinc-700 mt-0.5">
                        Scan this QR code from Guardian Vault on your phone or
                        another computer to transfer items offline without a
                        network.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-900 mb-1">
                        Optional QR Password (AES-256-GCM)
                      </label>
                      <input
                        type="password"
                        value={qrPassword}
                        onChange={(e) => setQrPassword(e.target.value)}
                        placeholder="Leave blank for plain QR or enter password..."
                        className="w-full rounded-xl bg-white border-2 border-zinc-950/25 px-3 py-2 text-xs text-zinc-950"
                      />
                    </div>

                    {qrEncodedString && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                qrEncodedString
                              );
                              onToast('Copied QR transfer payload string');
                            } catch {
                              // ignore
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white px-3.5 py-2 text-xs font-bold uppercase cursor-pointer"
                        >
                          <Copy size={13} />
                          <span>Copy QR Payload String</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/90 border-2 border-zinc-950 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Scan with Camera or Paste QR Payload (`GVQR1:...`)
                  </span>
                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={startCameraQrScanner}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white px-3 py-1.5 text-xs font-bold uppercase cursor-pointer"
                    >
                      <Camera size={14} />
                      <span>Start Camera</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-900 text-white px-3 py-1.5 text-xs font-bold uppercase cursor-pointer"
                    >
                      <span>Stop Camera</span>
                    </button>
                  )}
                </div>

                {cameraActive && (
                  <div className="rounded-2xl overflow-hidden bg-black border-2 border-zinc-950 max-w-xs mx-auto">
                    <video
                      ref={videoRef}
                      className="w-full h-48 object-cover"
                      playsInline
                      muted
                    />
                  </div>
                )}

                <div>
                  <textarea
                    value={qrScanInput}
                    onChange={(e) => setQrScanInput(e.target.value)}
                    rows={3}
                    placeholder="Paste scanned QR transfer string (GVQR1:... or GVQRE1:...) or URL here..."
                    className="w-full rounded-xl bg-zinc-50 border border-zinc-950/30 p-2.5 font-mono text-xs text-zinc-950"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      disabled={!qrScanInput.trim()}
                      onClick={async () => {
                        setTab('import');
                        await runPreviewAnalysis(
                          qrScanInput,
                          'Scanned QR Transfer'
                        );
                      }}
                      className="rounded-xl bg-zinc-950 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      Preview Scanned QR Items
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-950 text-red-100 px-3.5 py-2.5 text-xs font-medium flex items-center gap-2"
              >
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
