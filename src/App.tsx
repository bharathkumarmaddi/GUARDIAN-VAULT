import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  AutoLockMinutes,
  DuplicateStrategy,
  HackathonStatus,
  ItemType,
  VaultCollection,
  VaultItem,
  VaultMeta,
  VaultTag,
} from './types/vault';
import { SECTIONS } from './constants/sections';
import {
  changeVaultMasterPassword,
  changeVaultPin,
  completeMigrationPinAndRecovery,
  deleteEncryptedItem,
  getVaultMeta,
  regenerateVaultRecoveryKey,
  resetCredentialsWithRecoveryKey,
  resetPinWithMasterPassword,
  saveEncryptedCollection,
  saveEncryptedItem,
  saveEncryptedItemsBulk,
  saveEncryptedTag,
  setupGuardianVault,
  unlockVaultWithPassword,
  unlockVaultWithPin,
  updateAutoLockMinutes,
  updateVaultMeta,
  wipeEntireVault,
} from './db/vaultDb';
import { normalizeUrl } from './utils/vaultLogic';
import { copyItemsToUniversalClipboard } from './utils/universalTransfer';
import {
  checkLinkReachability,
  fetchGitHubRepoMeta,
  fetchStarredReposByUsername,
} from './utils/onlineExtras';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import { LockScreen } from './components/LockScreen';
import { HomeCarousel } from './components/HomeCarousel';
import { SectionListView } from './components/SectionListView';
import { ItemModal } from './components/ItemModal';
import { CommandPalette } from './components/CommandPalette';
import {
  PortabilityModal,
  PortabilityTab,
} from './components/PortabilityModal';
import { SettingsModal } from './components/SettingsModal';
import { QrShareModal } from './components/QrShareModal';
import { DownloadModal } from './components/DownloadModal';

interface ToastState {
  message: string;
  undoItemId?: string;
}

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [vaultMeta, setVaultMeta] = useState<VaultMeta | null>(null);
  const [pendingMigrationKey, setPendingMigrationKey] =
    useState<CryptoKey | null>(null);

  const [items, setItems] = useState<VaultItem[]>([]);
  const [collections, setCollections] = useState<VaultCollection[]>([]);
  const [tags, setTags] = useState<VaultTag[]>([]);

  // Navigation & UI state
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<'carousel' | 'list'>('carousel');
  const [activeListType, setActiveListType] = useState<ItemType>('link');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalType, setItemModalType] = useState<ItemType>('link');
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [portabilityOpen, setPortabilityOpen] = useState(false);
  const [portabilityInitialTab, setPortabilityInitialTab] =
    useState<PortabilityTab>('export');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.location.hash === '#download'
  );
  const [qrShareItem, setQrShareItem] = useState<VaultItem | null>(null);

  // Toast with optional Undo
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const isOnline = useOnlineStatus();
  const { isInstallable, install } = usePWAInstall();

  const showToast = useCallback((message: string, undoItemId?: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, undoItemId });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  // Startup flow: read vault metadata (migrating from legacy DB if needed),
  // show setup if no vault exists, otherwise show the unlock screen.
  // Startup never creates, unlocks, or wipes a vault by itself.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const meta = await getVaultMeta();
        if (!mounted) return;
        setVaultMeta(meta || null);
        setIsInitialized(Boolean(meta));
      } finally {
        if (mounted) setBootstrapping(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#download') {
        setDownloadModalOpen(true);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLockVault = useCallback(() => {
    setCryptoKey(null);
    setPendingMigrationKey(null);
    setItemModalOpen(false);
    setCommandPaletteOpen(false);
    setPortabilityOpen(false);
    setSettingsOpen(false);
    setQrShareItem(null);
    showToast('Vault locked. Master key cleared from memory.');
  }, [showToast]);

  // Configurable Auto-lock timer (1, 5, 10 default, 30 minutes, or 0 = never)
  useEffect(() => {
    if (!cryptoKey) return;
    const autoLockMinutes = vaultMeta?.autoLockMinutes ?? 10;
    if (autoLockMinutes === 0) return;

    const timeoutMs = autoLockMinutes * 60 * 1000;
    let idleTimer = window.setTimeout(() => {
      handleLockVault();
    }, timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        handleLockVault();
      }, timeoutMs);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));

    return () => {
      window.clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [cryptoKey, vaultMeta?.autoLockMinutes, handleLockVault]);

  // Global keyboard shortcuts: Ctrl+K, /, N, Esc
  useEffect(() => {
    if (!cryptoKey) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (qrShareItem) {
          setQrShareItem(null);
        } else if (itemModalOpen) {
          setItemModalOpen(false);
        } else if (portabilityOpen) {
          setPortabilityOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (downloadModalOpen) {
          setDownloadModalOpen(false);
        } else if (currentScreen === 'list') {
          setCurrentScreen('carousel');
        }
        return;
      }

      if (isInputFocused) return;

      if (e.key === '/') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const activeType =
          currentScreen === 'list'
            ? activeListType
            : SECTIONS[activeIndex]?.id || 'link';
        setEditingItem(null);
        setItemModalType(activeType);
        setItemModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    cryptoKey,
    commandPaletteOpen,
    qrShareItem,
    itemModalOpen,
    portabilityOpen,
    settingsOpen,
    downloadModalOpen,
    currentScreen,
    activeListType,
    activeIndex,
  ]);

  const handleCompleteSetup = async (
    pin: string,
    password: string,
    recoveryKey: string
  ) => {
    const res = await setupGuardianVault(pin, password, recoveryKey);
    setIsInitialized(true);
    setCryptoKey(res.key);
    setVaultMeta(res.meta);
    setItems(res.items);
    setCollections(res.collections);
    setTags(res.tags);
    showToast('Guardian Vault initialized with AES-GCM envelope encryption');
  };

  const handleUnlockWithPin = async (pin: string) => {
    try {
      const res = await unlockVaultWithPin(pin);
      setCryptoKey(res.key);
      setVaultMeta(res.meta);
      setItems(res.items);
      setCollections(res.collections);
      setTags(res.tags);
      showToast('Guardian Vault unlocked');
    } catch (err) {
      const refreshedMeta = await getVaultMeta();
      if (refreshedMeta) setVaultMeta(refreshedMeta);
      throw err;
    }
  };

  const handleUnlockWithPassword = async (password: string) => {
    const res = await unlockVaultWithPassword(password);
    setVaultMeta(res.meta);
    setItems(res.items);
    setCollections(res.collections);
    setTags(res.tags);
    if (res.needsMigrationSetup) {
      setPendingMigrationKey(res.key);
      showToast('Legacy vault migrated — please set a 4-digit PIN and save your recovery key');
    } else {
      setCryptoKey(res.key);
      showToast('Guardian Vault unlocked');
    }
  };

  const handleCompleteMigration = async (pin: string, recoveryKey: string) => {
    if (!pendingMigrationKey) return;
    const { meta } = await completeMigrationPinAndRecovery(
      pendingMigrationKey,
      pin,
      recoveryKey
    );
    setVaultMeta(meta);
    setCryptoKey(pendingMigrationKey);
    setPendingMigrationKey(null);
    showToast('Migration complete — PIN and recovery key enabled');
  };

  const handleResetPinWithPassword = async (
    password: string,
    newPin: string
  ) => {
    const res = await resetPinWithMasterPassword(password, newPin);
    setCryptoKey(res.key);
    setVaultMeta(res.meta);
    setItems(res.items);
    setCollections(res.collections);
    setTags(res.tags);
    showToast('4-digit PIN reset & Guardian Vault unlocked');
  };

  const handleResetPasswordWithRecoveryKey = async (
    recoveryKey: string,
    newPassword: string,
    newPin: string
  ): Promise<string> => {
    const res = await resetCredentialsWithRecoveryKey(
      recoveryKey,
      newPassword,
      newPin
    );
    setVaultMeta(res.meta);
    setItems(res.items);
    setCollections(res.collections);
    setTags(res.tags);
    return res.newRecoveryKey;
  };

  const handleSaveItem = async (item: VaultItem) => {
    if (!cryptoKey) return;
    await saveEncryptedItem(cryptoKey, item);
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      return exists
        ? prev.map((i) => (i.id === item.id ? item : i))
        : [item, ...prev];
    });
    showToast(editingItem ? 'Updated encrypted item' : 'Saved & encrypted to vault');
  };

  const handlePatchItem = async (
    item: VaultItem,
    patch: Partial<VaultItem>,
    toastMsg?: string,
    withUndoId?: string
  ) => {
    if (!cryptoKey) return;
    const updated: VaultItem = {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await saveEncryptedItem(cryptoKey, updated);
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    if (toastMsg) {
      showToast(toastMsg, withUndoId);
    }
  };

  const handleUndoTrash = async (itemId: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target || !cryptoKey) return;
    await handlePatchItem(
      target,
      { trashed: false, trashedAt: undefined },
      'Restored item from Trash'
    );
  };

  const handleDeletePermanently = async (item: VaultItem) => {
    await deleteEncryptedItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    showToast('Permanently deleted item');
  };

  const handleEmptyTrash = async () => {
    const trashed = items.filter((i) => i.trashed);
    for (const t of trashed) {
      await deleteEncryptedItem(t.id);
    }
    setItems((prev) => prev.filter((i) => !i.trashed));
    showToast('Emptied Trash');
  };

  const handleCreateCollection = async (name: string) => {
    if (!cryptoKey) return;
    const col: VaultCollection = {
      id: `col-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
    };
    await saveEncryptedCollection(cryptoKey, col);
    setCollections((prev) => [...prev, col]);
    showToast(`Created collection "${name}"`);
  };

  const handleCreateTag = async (name: string, color: string) => {
    if (!cryptoKey) return;
    const tag: VaultTag = {
      id: `tag-${Date.now()}`,
      name,
      color,
    };
    await saveEncryptedTag(cryptoKey, tag);
    setTags((prev) => [...prev, tag]);
  };

  const handleRefreshGitHubMeta = async (item: VaultItem) => {
    if (!cryptoKey) return;
    const repoKey = item.ownerRepo || item.url || item.title;
    const meta = await fetchGitHubRepoMeta(repoKey);
    if (!meta) {
      showToast('Could not reach GitHub API (offline or rate limited)');
      return;
    }
    await handlePatchItem(
      item,
      {
        ownerRepo: meta.ownerRepo,
        description: meta.description || item.description,
        stars: meta.stars,
        language: meta.language,
        lastUpdated: meta.lastUpdated,
        readmePreview: meta.readmePreview || item.readmePreview,
      },
      `Synced ${meta.ownerRepo} (${meta.stars.toLocaleString()} ★)`
    );
  };

  const handleImportPayload = async (
    importedItems: VaultItem[],
    importedCols: VaultCollection[],
    importedTags: VaultTag[],
    strategy: DuplicateStrategy
  ): Promise<number> => {
    if (!cryptoKey) return 0;

    for (const c of importedCols) {
      if (!collections.some((existing) => existing.id === c.id)) {
        await saveEncryptedCollection(cryptoKey, c);
        setCollections((prev) => [...prev, c]);
      }
    }
    for (const t of importedTags) {
      if (!tags.some((existing) => existing.name === t.name)) {
        await saveEncryptedTag(cryptoKey, t);
        setTags((prev) => [...prev, t]);
      }
    }

    const nextItems = [...items];
    const toPersist: VaultItem[] = [];
    let importedCount = 0;

    for (const incoming of importedItems) {
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
        return Boolean(incoming.id && existing.id === incoming.id);
      });

      if (duplicateIdx !== -1) {
        if (strategy === 'skip') {
          continue;
        } else if (strategy === 'replace') {
          const replaced: VaultItem = {
            ...incoming,
            id: nextItems[duplicateIdx].id,
            updatedAt: new Date().toISOString(),
          };
          nextItems[duplicateIdx] = replaced;
          toPersist.push(replaced);
          importedCount++;
          continue;
        } else {
          const copyItem: VaultItem = {
            ...incoming,
            id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: `${incoming.title} (Imported)`,
            updatedAt: new Date().toISOString(),
          };
          nextItems.unshift(copyItem);
          toPersist.push(copyItem);
          importedCount++;
          continue;
        }
      } else {
        const freshItem: VaultItem = {
          ...incoming,
          id:
            incoming.id && !nextItems.some((e) => e.id === incoming.id)
              ? incoming.id
              : `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        nextItems.unshift(freshItem);
        toPersist.push(freshItem);
        importedCount++;
      }
    }

    if (toPersist.length > 0) {
      await saveEncryptedItemsBulk(cryptoKey, toPersist);
      setItems(nextItems);
    }

    return importedCount;
  };

  const handleApplySelectiveImport = async (
    nextItems: VaultItem[],
    itemsToPersist: VaultItem[],
    importedCols: VaultCollection[],
    importedTags: VaultTag[]
  ) => {
    if (!cryptoKey) return;

    for (const c of importedCols) {
      if (!collections.some((existing) => existing.id === c.id)) {
        await saveEncryptedCollection(cryptoKey, c);
        setCollections((prev) => [...prev, c]);
      }
    }
    for (const t of importedTags) {
      if (!tags.some((existing) => existing.name === t.name)) {
        await saveEncryptedTag(cryptoKey, t);
        setTags((prev) => [...prev, t]);
      }
    }

    if (itemsToPersist.length > 0) {
      await saveEncryptedItemsBulk(cryptoKey, itemsToPersist);
      setItems(nextItems);
    }
  };

  const handleCopyUniversalItems = async (
    itemsToCopy: VaultItem[],
    label?: string
  ) => {
    try {
      const res = await copyItemsToUniversalClipboard(
        itemsToCopy,
        collections,
        tags
      );
      showToast(
        label
          ? `Copied ${res.itemCount} item(s) from ${label} (.gvault + URLs) to clipboard.`
          : `${res.itemCount} item(s) copied to universal clipboard. Switch devices and paste to transfer.`
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Failed to copy to clipboard. Use Export .gvault instead.'
      );
    }
  };

  const handleRecordBackup = async () => {
    const nowIso = new Date().toISOString();
    const updated = await updateVaultMeta({ lastBackupAt: nowIso });
    if (updated) setVaultMeta(updated);
  };

  const handleToggleTheme = async () => {
    const nextTheme = vaultMeta?.theme === 'light' ? 'dark' : 'light';
    const updated = await updateVaultMeta({ theme: nextTheme });
    if (updated) setVaultMeta(updated);
  };

  const handleChangeAutoLock = async (minutes: AutoLockMinutes) => {
    const updated = await updateAutoLockMinutes(minutes);
    if (updated) setVaultMeta(updated);
    showToast(
      minutes === 0
        ? 'Auto-lock disabled'
        : `Auto-lock set to ${minutes} minute(s)`
    );
  };

  const handleChangePin = async (newPin: string) => {
    if (!cryptoKey) return;
    const updated = await changeVaultPin(cryptoKey, newPin);
    setVaultMeta(updated);
  };

  const handleChangePassword = async (currentPass: string, newPass: string) => {
    const res = await changeVaultMasterPassword(currentPass, newPass);
    setCryptoKey(res.key);
    setVaultMeta(res.meta);
  };

  const handleRegenerateRecoveryKey = async (
    currentPass: string
  ): Promise<string> => {
    const res = await regenerateVaultRecoveryKey(currentPass);
    setVaultMeta(res.meta);
    return res.recoveryKey;
  };

  const handleImportGitHubStars = async (username: string): Promise<number> => {
    const drafts = await fetchStarredReposByUsername(username);
    const now = new Date().toISOString();
    const fullItems: VaultItem[] = drafts.map((d, i) => ({
      id: `gh-star-${Date.now()}-${i}`,
      type: 'github',
      title: d.title || 'Starred Repo',
      ownerRepo: d.ownerRepo,
      url: d.url,
      description: d.description,
      stars: d.stars || 0,
      language: d.language || 'Code',
      lastUpdated: d.lastUpdated || now,
      tags: d.tags || ['starred'],
      collectionId: 'col-dev',
      pinned: false,
      favourite: true,
      archived: false,
      trashed: false,
      createdAt: now,
      updatedAt: now,
      openCount: 0,
      deadLinkStatus: 'ok',
    }));
    return handleImportPayload(fullItems, [], [], 'skip');
  };

  const handleRunDeadLinkChecker = async () => {
    if (!cryptoKey) return;
    const candidates = items.filter((i) => !i.trashed && i.url);
    showToast(`Checking ${candidates.length} links...`);
    let deadCount = 0;
    const updatedList = [...items];

    for (const item of candidates) {
      const status = await checkLinkReachability(item);
      if (status === 'dead') deadCount++;
      const idx = updatedList.findIndex((x) => x.id === item.id);
      if (idx !== -1) {
        updatedList[idx] = { ...updatedList[idx], deadLinkStatus: status };
      }
    }

    await saveEncryptedItemsBulk(cryptoKey, updatedList);
    setItems(updatedList);
    showToast(
      deadCount > 0
        ? `Dead link check complete: ${deadCount} unreachable link(s) flagged.`
        : `All ${candidates.length} links are reachable!`
    );
  };

  const handleWipeVault = async () => {
    await wipeEntireVault();
    setCryptoKey(null);
    setPendingMigrationKey(null);
    setVaultMeta(null);
    setIsInitialized(false);
    setItems([]);
    setCollections([]);
    setTags([]);
    showToast('GuardianVaultDB wiped clean');
  };

  if (bootstrapping) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-white font-anton text-2xl tracking-wider uppercase">
        Loading Guardian Vault...
      </div>
    );
  }

  return (
    <>
      {!cryptoKey ? (
        <LockScreen
          isInitialized={isInitialized}
          vaultMeta={vaultMeta}
          activeSectionIndex={activeIndex}
          pendingMigrationSetup={Boolean(pendingMigrationKey)}
          onUnlockWithPin={handleUnlockWithPin}
          onUnlockWithPassword={handleUnlockWithPassword}
          onCompleteSetup={handleCompleteSetup}
          onCompleteMigration={handleCompleteMigration}
          onResetPinWithPassword={handleResetPinWithPassword}
          onResetPasswordWithRecoveryKey={handleResetPasswordWithRecoveryKey}
          onStartFreshWipe={handleWipeVault}
          onOpenDownloadModal={() => setDownloadModalOpen(true)}
        />
      ) : currentScreen === 'carousel' ? (
        <HomeCarousel
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          items={items}
          lastBackupAt={vaultMeta?.lastBackupAt}
          isPWAInstallable={isInstallable}
          onInstallPWA={install}
          onOpenSection={(type) => {
            const secIdx = SECTIONS.findIndex((s) => s.id === type);
            if (secIdx !== -1) setActiveIndex(secIdx);
            setActiveListType(type);
            setCurrentScreen('list');
          }}
          onOpenQuickAdd={(defaultType) => {
            setEditingItem(null);
            setItemModalType(
              defaultType || SECTIONS[activeIndex]?.id || 'link'
            );
            setItemModalOpen(true);
          }}
          onOpenSearch={() => setCommandPaletteOpen(true)}
          onOpenPortability={() => {
            setPortabilityInitialTab('export');
            setPortabilityOpen(true);
          }}
          onOpenPasteModal={() => {
            setPortabilityInitialTab('import');
            setPortabilityOpen(true);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDownloadModal={() => setDownloadModalOpen(true)}
          onLockVault={handleLockVault}
        />
      ) : (
        <SectionListView
          activeType={activeListType}
          theme={vaultMeta?.theme || 'dark'}
          items={items}
          collections={collections}
          tags={tags}
          selectedItemIds={selectedItemIds}
          isOnline={isOnline}
          onSelectType={(type) => {
            setActiveListType(type);
            const secIdx = SECTIONS.findIndex((s) => s.id === type);
            if (secIdx !== -1) setActiveIndex(secIdx);
          }}
          onBackToCarousel={() => setCurrentScreen('carousel')}
          onOpenQuickAdd={(type) => {
            setEditingItem(null);
            setItemModalType(type);
            setItemModalOpen(true);
          }}
          onEditItem={(item) => {
            setEditingItem(item);
            setItemModalType(item.type);
            setItemModalOpen(true);
          }}
          onTogglePin={(item) =>
            handlePatchItem(
              item,
              { pinned: !item.pinned },
              item.pinned ? 'Unpinned item' : 'Pinned item to top'
            )
          }
          onToggleFavourite={(item) =>
            handlePatchItem(
              item,
              { favourite: !item.favourite },
              item.favourite ? 'Removed from favourites' : 'Added to favourites'
            )
          }
          onToggleArchive={(item) =>
            handlePatchItem(
              item,
              { archived: !item.archived },
              item.archived ? 'Unarchived item' : 'Archived item'
            )
          }
          onMoveToTrash={(item) =>
            handlePatchItem(
              item,
              { trashed: true, trashedAt: new Date().toISOString() },
              `Moved "${item.title}" to Trash`,
              item.id
            )
          }
          onRestoreFromTrash={(item) =>
            handlePatchItem(
              item,
              { trashed: false, trashedAt: undefined },
              `Restored "${item.title}"`
            )
          }
          onDeletePermanently={handleDeletePermanently}
          onEmptyTrash={handleEmptyTrash}
          onIncrementOpenCount={(item) =>
            handlePatchItem(item, { openCount: (item.openCount || 0) + 1 })
          }
          onUpdateHackathonStatus={(item: VaultItem, status: HackathonStatus) =>
            handlePatchItem(
              item,
              { hackathonStatus: status },
              `Hackathon status updated to ${status}`
            )
          }
          onRefreshGitHubMeta={handleRefreshGitHubMeta}
          onOpenQrShare={(item) => setQrShareItem(item)}
          onToggleSelectItem={(id) =>
            setSelectedItemIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }
          onSelectAllItems={(ids) => setSelectedItemIds(ids)}
          onClearSelection={() => setSelectedItemIds([])}
          onCopyUniversalItems={handleCopyUniversalItems}
          onCreateCollection={handleCreateCollection}
          onOpenSearchPalette={() => setCommandPaletteOpen(true)}
          onOpenPortability={() => {
            setPortabilityInitialTab('export');
            setPortabilityOpen(true);
          }}
          onOpenPasteModal={() => {
            setPortabilityInitialTab('import');
            setPortabilityOpen(true);
          }}
          onOpenQrTransferModal={() => {
            setPortabilityInitialTab('qr');
            setPortabilityOpen(true);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onLockVault={handleLockVault}
        />
      )}

      {/* Quick Add / Edit Modal */}
      <ItemModal
        isOpen={itemModalOpen}
        initialType={itemModalType}
        editingItem={editingItem}
        existingItems={items}
        collections={collections}
        tags={tags}
        isOnline={isOnline}
        onClose={() => setItemModalOpen(false)}
        onSave={handleSaveItem}
        onCreateTag={handleCreateTag}
      />

      {/* Ctrl+K Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        items={items}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectItem={(item) => {
          setActiveListType(item.type);
          const idx = SECTIONS.findIndex((s) => s.id === item.type);
          if (idx !== -1) setActiveIndex(idx);
          setCurrentScreen('list');
          setEditingItem(item);
          setItemModalType(item.type);
          setItemModalOpen(true);
        }}
        onOpenSection={(type) => {
          setActiveListType(type);
          const idx = SECTIONS.findIndex((s) => s.id === type);
          if (idx !== -1) setActiveIndex(idx);
          setCurrentScreen('list');
        }}
        onOpenQuickAdd={(type) => {
          setEditingItem(null);
          setItemModalType(type);
          setItemModalOpen(true);
        }}
        onOpenPortability={() => {
          setPortabilityInitialTab('export');
          setPortabilityOpen(true);
        }}
        onLockVault={handleLockVault}
      />

      {/* Portability (Universal Copy, Paste, .gvault Export, Import, QR Transfer) Modal */}
      <PortabilityModal
        isOpen={portabilityOpen}
        initialTab={portabilityInitialTab}
        activeSectionIndex={activeIndex}
        items={items}
        selectedItemIds={selectedItemIds}
        collections={collections}
        tags={tags}
        lastBackupAt={vaultMeta?.lastBackupAt}
        onClose={() => setPortabilityOpen(false)}
        onApplySelectiveImport={handleApplySelectiveImport}
        onRecordBackup={handleRecordBackup}
        onToast={(msg) => showToast(msg)}
      />

      {/* Settings & Security Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        activeSectionIndex={activeIndex}
        theme={vaultMeta?.theme || 'dark'}
        autoLockMinutes={vaultMeta?.autoLockMinutes ?? 10}
        isOnline={isOnline}
        onClose={() => setSettingsOpen(false)}
        onToggleTheme={handleToggleTheme}
        onChangeAutoLock={handleChangeAutoLock}
        onChangePin={handleChangePin}
        onChangePassword={handleChangePassword}
        onRegenerateRecoveryKey={handleRegenerateRecoveryKey}
        onImportGitHubStars={handleImportGitHubStars}
        onRunDeadLinkChecker={handleRunDeadLinkChecker}
        onWipeVault={handleWipeVault}
        onOpenDownloadModal={() => setDownloadModalOpen(true)}
        onToast={(msg) => showToast(msg)}
      />

      {/* Native OS Download Modal */}
      <DownloadModal
        isOpen={downloadModalOpen}
        activeSectionIndex={activeIndex}
        onClose={() => {
          setDownloadModalOpen(false);
          if (window.location.hash === '#download') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
      />

      {/* QR Code & Share Modal */}
      <QrShareModal
        item={qrShareItem}
        onClose={() => setQrShareItem(null)}
        onToast={(msg) => showToast(msg)}
      />

      {/* Toast Notification with Undo Support */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-90 flex items-center gap-3 rounded-2xl bg-zinc-950 text-white border-2 border-white/25 px-4 py-3 text-xs sm:text-sm font-semibold shadow-2xl"
        >
          <span>{toast.message}</span>
          {toast.undoItemId && (
            <button
              type="button"
              onClick={() => {
                const id = toast.undoItemId!;
                setToast(null);
                handleUndoTrash(id);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-white text-zinc-950 px-2.5 py-1 text-xs font-bold uppercase cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Undo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
