import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  LayoutGrid,
  List,
  Pin,
  Star,
  Archive,
  Trash2,
  RotateCcw,
  QrCode,
  Share2,
  Edit3,
  ExternalLink,
  FolderPlus,
  Lock,
  Download,
  Settings,
  RefreshCw,
  CheckSquare,
  Square,
  Clock,
  Users,
  Copy,
  ClipboardPaste,
} from 'lucide-react';
import {
  HackathonStatus,
  ItemType,
  SortOption,
  VaultCollection,
  VaultItem,
  VaultTag,
  ViewMode,
} from '../types/vault';
import { SECTIONS, SECTION_BY_TYPE } from '../constants/sections';
import {
  filterAndSortItems,
  formatCountdown,
  renderMarkdownToHtml,
} from '../utils/vaultLogic';
import { GrainOverlay } from './GrainOverlay';

interface SectionListViewProps {
  activeType: ItemType;
  theme: 'dark' | 'light';
  items: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
  selectedItemIds: string[];
  isOnline: boolean;
  onSelectType: (type: ItemType) => void;
  onBackToCarousel: () => void;
  onOpenQuickAdd: (type: ItemType) => void;
  onEditItem: (item: VaultItem) => void;
  onTogglePin: (item: VaultItem) => void;
  onToggleFavourite: (item: VaultItem) => void;
  onToggleArchive: (item: VaultItem) => void;
  onMoveToTrash: (item: VaultItem) => void;
  onRestoreFromTrash: (item: VaultItem) => void;
  onDeletePermanently: (item: VaultItem) => void;
  onEmptyTrash: () => void;
  onIncrementOpenCount: (item: VaultItem) => void;
  onUpdateHackathonStatus: (item: VaultItem, status: HackathonStatus) => void;
  onRefreshGitHubMeta: (item: VaultItem) => Promise<void>;
  onOpenQrShare: (item: VaultItem) => void;
  onToggleSelectItem: (id: string) => void;
  onSelectAllItems: (ids: string[]) => void;
  onClearSelection: () => void;
  onCopyUniversalItems: (itemsToCopy: VaultItem[], label?: string) => void;
  onCreateCollection: (name: string) => Promise<void>;
  onOpenSearchPalette: () => void;
  onOpenPortability: () => void;
  onOpenPasteModal: () => void;
  onOpenQrTransferModal: () => void;
  onOpenSettings: () => void;
  onLockVault: () => void;
}

const HACKATHON_STATUSES: HackathonStatus[] = [
  'Interested',
  'Registered',
  'Building',
  'Submitted',
  'Done',
];

export const SectionListView: React.FC<SectionListViewProps> = ({
  activeType,
  theme,
  items,
  collections,
  tags,
  selectedItemIds,
  isOnline,
  onSelectType,
  onBackToCarousel,
  onOpenQuickAdd,
  onEditItem,
  onTogglePin,
  onToggleFavourite,
  onToggleArchive,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeletePermanently,
  onEmptyTrash,
  onIncrementOpenCount,
  onUpdateHackathonStatus,
  onRefreshGitHubMeta,
  onOpenQrShare,
  onToggleSelectItem,
  onSelectAllItems,
  onClearSelection,
  onCopyUniversalItems,
  onCreateCollection,
  onOpenSearchPalette,
  onOpenPortability,
  onOpenPasteModal,
  onOpenQrTransferModal,
  onOpenSettings,
  onLockVault,
}) => {
  const section = SECTION_BY_TYPE[activeType] || SECTIONS[0];

  const [query, setQuery] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [onlyFavourite, setOnlyFavourite] = useState(false);
  const [viewState, setViewState] = useState<'active' | 'archived' | 'trashed'>('active');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [addingCollection, setAddingCollection] = useState(false);
  const [expandedReadmeId, setExpandedReadmeId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return filterAndSortItems(items, {
      type: activeType,
      query,
      tag: selectedTag,
      collectionId: selectedCollection,
      onlyPinned,
      onlyFavourite,
      viewState,
      sortBy,
    });
  }, [
    items,
    activeType,
    query,
    selectedTag,
    selectedCollection,
    onlyPinned,
    onlyFavourite,
    viewState,
    sortBy,
  ]);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections]
  );

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    await onCreateCollection(newCollectionName.trim());
    setNewCollectionName('');
    setAddingCollection(false);
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`min-h-screen w-full relative transition-colors duration-500 ${
        isDark ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-950'
      }`}
    >
      <GrainOverlay />

      {/* Top Navigation Bar */}
      <header
        className="sticky top-0 z-40 border-b border-black/15 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4"
        style={{
          backgroundColor: section.bg,
          transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToCarousel}
            aria-label="Back to 3D Carousel Home"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
            <span>3D Carousel</span>
          </button>

          <span className="font-anton text-2xl sm:text-3xl uppercase tracking-tight text-white leading-none">
            {section.name}
          </span>
        </div>

        {/* Section Switcher Tabs */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-black/20 p-1 rounded-2xl">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSelectType(sec.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                sec.id === activeType
                  ? 'bg-white text-zinc-950 shadow'
                  : 'text-white/85 hover:text-white hover:bg-white/10'
              }`}
            >
              {sec.name}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenQuickAdd(activeType)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white px-3.5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
          >
            <Plus size={15} />
            <span>Quick Add</span>
          </button>
          <button
            type="button"
            onClick={onOpenPasteModal}
            aria-label="Paste and Import universal transfer data"
            title="Paste / Import (.gvault, Clipboard, URLs)"
            className="inline-flex items-center gap-1.5 rounded-xl bg-black/25 text-white px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-black/35 cursor-pointer whitespace-nowrap"
          >
            <ClipboardPaste size={15} />
            <span className="hidden sm:inline">Paste / Import</span>
          </button>
          <button
            type="button"
            onClick={onOpenPortability}
            aria-label="Backup and Export"
            title="Universal Export (.gvault)"
            className="inline-flex items-center gap-1.5 rounded-xl bg-black/20 text-white px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-black/30 cursor-pointer whitespace-nowrap"
          >
            <Download size={15} />
            <span className="hidden md:inline">Export</span>
          </button>
          <button
            type="button"
            onClick={onOpenSearchPalette}
            aria-label="Command palette search"
            className="p-2 rounded-xl bg-black/20 text-white hover:bg-black/30 cursor-pointer"
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="p-2 rounded-xl bg-black/20 text-white hover:bg-black/30 cursor-pointer"
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            onClick={onLockVault}
            aria-label="Lock Vault"
            className="p-2 rounded-xl bg-black/25 text-white hover:bg-black/40 cursor-pointer"
          >
            <Lock size={16} />
          </button>
        </div>
      </header>

      {/* Mobile Section Switcher */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto px-4 py-2.5 border-b border-white/10">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => onSelectType(sec.id)}
            style={
              sec.id === activeType ? { backgroundColor: sec.bg } : undefined
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap ${
              sec.id === activeType
                ? 'text-zinc-950'
                : 'bg-white/10 text-current'
            }`}
          >
            {sec.name}
          </button>
        ))}
      </div>

      {/* Main Workspace Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        {/* Left Sidebar: Collections, Tags, States */}
        <aside className="lg:col-span-3 space-y-5">
          {/* View State (Active / Archived / Trash) */}
          <div
            className={`rounded-2xl p-4 border ${
              isDark
                ? 'bg-zinc-900/90 border-white/10'
                : 'bg-white border-zinc-300'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-2.5">
              Vault Views
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setViewState('active')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  viewState === 'active'
                    ? 'text-zinc-950'
                    : 'opacity-80 hover:opacity-100'
                }`}
                style={
                  viewState === 'active'
                    ? { backgroundColor: section.bg }
                    : undefined
                }
              >
                <span>Active {section.name}</span>
                <span className="tabular-nums">
                  {
                    items.filter(
                      (i) =>
                        i.type === activeType && !i.trashed && !i.archived
                    ).length
                  }
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewState('archived')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  viewState === 'archived'
                    ? 'text-zinc-950'
                    : 'opacity-80 hover:opacity-100'
                }`}
                style={
                  viewState === 'archived'
                    ? { backgroundColor: section.bg }
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Archive size={14} />
                  <span>Archived</span>
                </span>
                <span className="tabular-nums">
                  {
                    items.filter(
                      (i) => i.type === activeType && !i.trashed && i.archived
                    ).length
                  }
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewState('trashed')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                  viewState === 'trashed'
                    ? 'text-zinc-950'
                    : 'opacity-80 hover:opacity-100'
                }`}
                style={
                  viewState === 'trashed'
                    ? { backgroundColor: section.bg }
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={14} />
                  <span>Trash</span>
                </span>
                <span className="tabular-nums">
                  {
                    items.filter((i) => i.type === activeType && i.trashed)
                      .length
                  }
                </span>
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-current/10 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyPinned((v) => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  onlyPinned
                    ? 'bg-amber-400 text-zinc-950 border-amber-400'
                    : 'border-current/20 opacity-80'
                }`}
              >
                <Pin size={13} />
                <span>Pinned</span>
              </button>
              <button
                type="button"
                onClick={() => setOnlyFavourite((v) => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  onlyFavourite
                    ? 'bg-rose-400 text-zinc-950 border-rose-400'
                    : 'border-current/20 opacity-80'
                }`}
              >
                <Star size={13} />
                <span>Favourites</span>
              </button>
            </div>
          </div>

          {/* Collections (Folders) */}
          <div
            className={`rounded-2xl p-4 border ${
              isDark
                ? 'bg-zinc-900/90 border-white/10'
                : 'bg-white border-zinc-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">
                Collections
              </span>
              <button
                type="button"
                onClick={() => setAddingCollection((v) => !v)}
                aria-label="New collection folder"
                className="text-xs font-bold inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
              >
                <FolderPlus size={14} />
                <span>New</span>
              </button>
            </div>

            {addingCollection && (
              <form onSubmit={handleAddCollection} className="mb-3 flex gap-1.5">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Folder name..."
                  className="flex-1 rounded-lg bg-black/20 border border-current/20 px-2.5 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-zinc-950 cursor-pointer"
                  style={{ backgroundColor: section.bg }}
                >
                  Add
                </button>
              </form>
            )}

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedCollection('all')}
                className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  selectedCollection === 'all'
                    ? 'bg-white/15 font-bold'
                    : 'opacity-75 hover:opacity-100'
                }`}
              >
                All Collections
              </button>
              {collections.map((col) => {
                const colItems = items.filter(
                  (i) => !i.trashed && i.collectionId === col.id
                );
                return (
                  <div
                    key={col.id}
                    className={`flex items-center justify-between gap-1 px-2 py-1 rounded-xl text-xs font-semibold ${
                      selectedCollection === col.id
                        ? 'bg-white/15 font-bold'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(col.id)}
                      className="flex-1 text-left truncate py-0.5 cursor-pointer"
                    >
                      {col.name}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="tabular-nums opacity-65">
                        {
                          items.filter(
                            (i) =>
                              i.type === activeType &&
                              !i.trashed &&
                              i.collectionId === col.id
                          ).length
                        }
                      </span>
                      {colItems.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyUniversalItems(
                              colItems,
                              `collection "${col.name}"`
                            );
                          }}
                          aria-label={`Copy collection ${col.name}`}
                          title={`Copy all ${colItems.length} item(s) in "${col.name}"`}
                          className="p-1 rounded-lg hover:bg-current/15 cursor-pointer"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coloured Tags Filter */}
          <div
            className={`rounded-2xl p-4 border ${
              isDark
                ? 'bg-zinc-900/90 border-white/10'
                : 'bg-white border-zinc-300'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-2.5">
              Coloured Tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTag('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  selectedTag === 'all'
                    ? 'bg-white text-zinc-950'
                    : 'bg-current/10 opacity-80'
                }`}
              >
                All
              </button>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setSelectedTag(selectedTag === t.name ? 'all' : t.name)
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    selectedTag === t.name
                      ? 'bg-white text-zinc-950 ring-2 ring-white'
                      : 'bg-current/10 opacity-85 hover:opacity-100'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  <span>#{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="lg:col-span-9 space-y-5">
          {/* Search, Sort & View Mode Toolbar */}
          <div
            className={`rounded-2xl p-3.5 border flex flex-wrap items-center justify-between gap-3 ${
              isDark
                ? 'bg-zinc-900/90 border-white/10'
                : 'bg-white border-zinc-300'
            }`}
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${section.name.toLowerCase()} by title, URL, #tag, or notes...`}
                className="w-full rounded-xl bg-black/15 border border-current/15 pl-9 pr-3.5 py-2 text-xs sm:text-sm focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {filteredItems.length > 0 && viewState !== 'trashed' && (
                <button
                  type="button"
                  onClick={() => {
                    const allFilteredSelected = filteredItems.every((f) =>
                      selectedItemIds.includes(f.id)
                    );
                    if (allFilteredSelected) {
                      onClearSelection();
                    } else {
                      onSelectAllItems(filteredItems.map((f) => f.id));
                    }
                  }}
                  aria-label="Select all visible items"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-black/15 border border-current/15 px-3 py-2 text-xs font-bold cursor-pointer hover:bg-black/25"
                >
                  <CheckSquare size={14} />
                  <span>
                    {filteredItems.every((f) => selectedItemIds.includes(f.id))
                      ? 'Deselect All'
                      : `Select All (${filteredItems.length})`}
                  </span>
                </button>
              )}

              <select
                aria-label="Sort items by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-xl bg-black/15 border border-current/15 px-3 py-2 text-xs font-bold"
              >
                <option value="newest" className="text-zinc-950">
                  Sort: Newest
                </option>
                <option value="az" className="text-zinc-950">
                  Sort: A to Z
                </option>
                <option value="updated" className="text-zinc-950">
                  Sort: Recently Updated
                </option>
                <option value="most_opened" className="text-zinc-950">
                  Sort: Most Opened
                </option>
              </select>

              <div className="inline-flex rounded-xl bg-black/15 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'grid' ? 'bg-white text-zinc-950' : 'opacity-70'
                  }`}
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'list' ? 'bg-white text-zinc-950' : 'opacity-70'
                  }`}
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Universal Transfer Selection Banner */}
          {selectedItemIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-zinc-900 border-2 border-white/25 px-4 py-3 text-xs font-bold text-white shadow-lg">
              <span>
                {selectedItemIds.length} item(s) selected for Universal Transfer
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const idSet = new Set(selectedItemIds);
                    const chosen = items.filter(
                      (i) => !i.trashed && idSet.has(i.id)
                    );
                    onCopyUniversalItems(chosen);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white text-zinc-950 px-3 py-1.5 font-bold uppercase tracking-wider hover:bg-zinc-200 cursor-pointer"
                >
                  <Copy size={13} />
                  <span>Copy Selected ({selectedItemIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenPortability}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/10 px-3 py-1.5 font-bold uppercase tracking-wider hover:bg-white/20 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Export .gvault</span>
                </button>
                {selectedItemIds.length <= 10 && (
                  <button
                    type="button"
                    onClick={onOpenQrTransferModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/10 px-3 py-1.5 font-bold uppercase tracking-wider hover:bg-white/20 cursor-pointer"
                  >
                    <QrCode size={13} />
                    <span>QR Transfer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="px-2 py-1 opacity-75 hover:opacity-100 cursor-pointer underline"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {viewState === 'trashed' && filteredItems.length > 0 && (
            <div className="flex items-center justify-between rounded-2xl bg-red-950/90 text-red-100 px-4 py-3 text-xs font-semibold">
              <span>
                Items in Trash can be restored or permanently wiped from IndexedDB.
              </span>
              <button
                type="button"
                onClick={onEmptyTrash}
                className="rounded-xl bg-red-500 text-zinc-950 px-3 py-1.5 font-bold uppercase tracking-wider cursor-pointer"
              >
                Empty Trash
              </button>
            </div>
          )}

          {/* Items Grid or List */}
          {filteredItems.length === 0 ? (
            <div
              className="rounded-3xl p-10 text-center border-2 border-zinc-950 text-zinc-950 shadow-lg"
              style={{ backgroundColor: section.panel }}
            >
              <h3 className="font-anton text-3xl uppercase tracking-tight mb-2">
                NO {section.name} FOUND
              </h3>
              <p className="text-sm text-zinc-900/80 max-w-md mx-auto mb-5">
                {viewState === 'trashed'
                  ? 'Your trash is clean.'
                  : query || selectedCollection !== 'all' || selectedTag !== 'all' || onlyPinned || onlyFavourite
                  ? 'No items matched your current search and filters.'
                  : 'Paste any URL with + Quick Add, press N on your keyboard, or import an existing .vault or browser bookmarks file.'}
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {(query || selectedCollection !== 'all' || selectedTag !== 'all' || onlyPinned || onlyFavourite) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setSelectedCollection('all');
                      setSelectedTag('all');
                      setOnlyPinned(false);
                      setOnlyFavourite(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-zinc-950 bg-white/90 text-zinc-950 px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-950 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>Clear Search &amp; Filters</span>
                  </button>
                )}
                {viewState === 'active' && (
                  <button
                    type="button"
                    onClick={() => onOpenQuickAdd(activeType)}
                    className="inline-flex items-center gap-2 rounded-full bg-zinc-950 text-white px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer shadow-md"
                  >
                    <Plus size={16} />
                    <span>Add First {section.singularLabel}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                  : 'space-y-3'
              }
            >
              {filteredItems.map((item) => {
                const isSelected = selectedItemIds.includes(item.id);
                const colName =
                  collectionMap.get(item.collectionId) || 'General Vault';
                const countdown =
                  item.type === 'hackathon'
                    ? formatCountdown(item.deadline)
                    : null;

                return (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open and edit item: ${item.title}`}
                    onClick={() => onEditItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) {
                        e.preventDefault();
                        onEditItem(item);
                      }
                    }}
                    className="group relative rounded-3xl border-2 border-zinc-950 p-5 text-zinc-950 shadow-md flex flex-col justify-between overflow-hidden cursor-pointer hover:shadow-xl hover:border-zinc-950 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 transition-all duration-150"
                    style={{
                      backgroundColor: section.panel,
                      transition:
                        'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms ease, box-shadow 150ms ease',
                    }}
                  >
                    <div>
                      {/* Top Metadata Row (Clean Unboxed Typography with Separators) */}
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-900/75 mb-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelectItem(item.id);
                            }}
                            aria-label={`Select ${item.title}`}
                            className="text-zinc-900 hover:opacity-75 cursor-pointer p-0.5"
                          >
                            {isSelected ? (
                              <CheckSquare size={15} />
                            ) : (
                              <Square size={15} />
                            )}
                          </button>
                          <span>{colName}</span>
                          {item.pinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-zinc-950">
                                Pinned
                              </span>
                            </>
                          )}
                          {item.deadLinkStatus === 'dead' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-red-900">
                                Dead Link
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 tabular-nums">
                          <span>{item.openCount || 0} opens</span>
                        </div>
                      </div>

                      {/* Title & Favicon / Repo Header */}
                      <div className="flex items-start gap-3 mb-2">
                        {item.type === 'link' && item.favicon && (
                          <img
                            src={item.favicon}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-lg object-contain shrink-0 mt-0.5 bg-zinc-950/10"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-anton text-xl sm:text-2xl uppercase tracking-tight text-zinc-950 leading-snug break-words group-hover:underline">
                            {item.title}
                          </h3>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                onIncrementOpenCount(item);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-zinc-900 underline hover:text-black break-all mt-0.5 cursor-pointer"
                            >
                              <span className="truncate max-w-[280px]">
                                {item.url}
                              </span>
                              <ExternalLink size={12} className="shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* GitHub Specific Telemetry */}
                      {item.type === 'github' && (
                        <div className="text-xs font-semibold text-zinc-900/85 mb-2 flex flex-wrap items-center gap-2 tabular-nums">
                          <span>★ {(item.stars || 0).toLocaleString()} stars</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.language || 'Code'}</span>
                          {item.lastUpdated && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                Updated{' '}
                                {new Date(item.lastUpdated).toLocaleDateString()}
                              </span>
                            </>
                          )}
                          {isOnline && (
                            <button
                              type="button"
                              onClick={() => onRefreshGitHubMeta(item)}
                              aria-label={`Refresh ${item.title} from GitHub`}
                              className="inline-flex items-center gap-1 underline font-bold text-zinc-950 cursor-pointer ml-auto"
                            >
                              <RefreshCw size={12} />
                              <span>Sync API</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Hackathon Specific Countdown & Status Selector */}
                      {item.type === 'hackathon' && (
                        <div className="my-2.5 p-3 rounded-2xl bg-white/65 border border-zinc-950/15 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Clock size={14} />
                              <span className="tabular-nums">
                                {countdown?.label}
                              </span>
                            </div>
                            <select
                              aria-label={`Status for ${item.title}`}
                              value={item.hackathonStatus || 'Interested'}
                              onChange={(e) =>
                                onUpdateHackathonStatus(
                                  item,
                                  e.target.value as HackathonStatus
                                )
                              }
                              className="rounded-lg bg-zinc-950 text-white px-2.5 py-1 text-xs font-bold cursor-pointer"
                            >
                              {HACKATHON_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>

                          {item.teamMembers && item.teamMembers.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-zinc-800">
                              <Users size={13} className="shrink-0" />
                              <span className="truncate">
                                Team: {item.teamMembers.join(', ')}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Description / Notes / Markdown Preview */}
                      {item.description && (
                        <p className="text-xs sm:text-sm text-zinc-900/90 leading-relaxed mb-2">
                          {item.description}
                        </p>
                      )}

                      {item.type === 'github' && item.notes && (
                        <div className="rounded-xl bg-white/60 p-2.5 text-xs text-zinc-900 mb-2">
                          <strong>My Notes:</strong> {item.notes}
                        </div>
                      )}

                      {item.type === 'github' && item.readmePreview && (
                        <div className="mb-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReadmeId(
                                expandedReadmeId === item.id ? null : item.id
                              )
                            }
                            className="text-xs font-bold underline cursor-pointer"
                          >
                            {expandedReadmeId === item.id
                              ? 'Hide cached README preview'
                              : 'Show cached README preview'}
                          </button>
                          {expandedReadmeId === item.id && (
                            <pre className="mt-1.5 p-2.5 rounded-xl bg-black/80 text-white text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {item.readmePreview}
                            </pre>
                          )}
                        </div>
                      )}

                      {item.type === 'note' && item.content && (
                        <div
                          className="rounded-2xl bg-white/75 p-3.5 text-zinc-950 max-h-52 overflow-y-auto mb-2 border border-zinc-950/10"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdownToHtml(item.content),
                          }}
                        />
                      )}
                    </div>

                    {/* Footer: Tags + Action Buttons */}
                    <div className="pt-3 mt-2 border-t border-zinc-950/15 flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs font-semibold text-zinc-900/80 truncate">
                        {item.tags.length > 0
                          ? item.tags.map((t) => `#${t}`).join(' · ')
                          : 'No tags'}
                      </div>

                      <div className="flex items-center gap-1">
                        {viewState === 'trashed' ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRestoreFromTrash(item);
                              }}
                              aria-label={`Restore ${item.title}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 text-white px-2.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-zinc-800"
                            >
                              <RotateCcw size={13} />
                              <span>Restore</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePermanently(item);
                              }}
                              aria-label={`Permanently delete ${item.title}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-900 text-white px-2.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-red-800"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePin(item);
                              }}
                              aria-label={`Pin ${item.title}`}
                              title={item.pinned ? 'Unpin' : 'Pin to top'}
                              className={`p-1.5 rounded-lg hover:bg-black/10 cursor-pointer ${
                                item.pinned
                                  ? 'bg-zinc-950 text-white'
                                  : 'text-zinc-900'
                              }`}
                            >
                              <Pin size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavourite(item);
                              }}
                              aria-label={`Favourite ${item.title}`}
                              title={item.favourite ? 'Remove favourite' : 'Add to favourites'}
                              className={`p-1.5 rounded-lg hover:bg-black/10 cursor-pointer ${
                                item.favourite
                                  ? 'bg-zinc-950 text-amber-300'
                                  : 'text-zinc-900'
                              }`}
                            >
                              <Star size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopyUniversalItems([item]);
                              }}
                              aria-label={`Copy ${item.title}`}
                              title="Universal Copy (.gvault + URL)"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenQrShare(item);
                              }}
                              aria-label={`QR Code and Share ${item.title}`}
                              title="Show QR Code and Share"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer"
                            >
                              <QrCode size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenQrShare(item);
                              }}
                              aria-label={`Share ${item.title}`}
                              title="Share link"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer"
                            >
                              <Share2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditItem(item);
                              }}
                              aria-label={`Edit ${item.title}`}
                              title="Edit item"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleArchive(item);
                              }}
                              aria-label={`Archive ${item.title}`}
                              title="Archive item"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer"
                            >
                              <Archive size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveToTrash(item);
                              }}
                              aria-label={`Move ${item.title} to trash`}
                              title="Move to trash"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-zinc-900 cursor-pointer hover:text-red-900"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
