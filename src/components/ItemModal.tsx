import React, { useEffect, useState } from 'react';
import {
  X,
  Globe,
  Github,
  FileText,
  Trophy,
  AlertTriangle,
  Sparkles,
  Eye,
  Edit3,
  Plus,
} from 'lucide-react';
import {
  HackathonStatus,
  ItemType,
  VaultCollection,
  VaultItem,
  VaultTag,
} from '../types/vault';
import { SECTIONS } from '../constants/sections';
import {
  detectUrlType,
  findDuplicateUrlItem,
  renderMarkdownToHtml,
} from '../utils/vaultLogic';
import {
  fetchGitHubRepoMeta,
  fetchWebsiteMetadata,
  generateLocalFaviconSvgDataUri,
} from '../utils/onlineExtras';

interface ItemModalProps {
  isOpen: boolean;
  initialType: ItemType;
  editingItem?: VaultItem | null;
  existingItems: VaultItem[];
  collections: VaultCollection[];
  tags: VaultTag[];
  isOnline: boolean;
  onClose: () => void;
  onSave: (item: VaultItem) => Promise<void>;
  onCreateTag: (name: string, color: string) => Promise<void>;
}

const HACKATHON_STATUSES: HackathonStatus[] = [
  'Interested',
  'Registered',
  'Building',
  'Submitted',
  'Done',
];

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  initialType,
  editingItem,
  existingItems,
  collections,
  tags,
  isOnline,
  onClose,
  onSave,
  onCreateTag,
}) => {
  const [type, setType] = useState<ItemType>(initialType);
  const [quickPasteUrl, setQuickPasteUrl] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [favicon, setFavicon] = useState('');
  // GitHub fields
  const [ownerRepo, setOwnerRepo] = useState('');
  const [stars, setStars] = useState<number>(0);
  const [language, setLanguage] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [notes, setNotes] = useState('');
  const [readmePreview, setReadmePreview] = useState('');
  // Note fields
  const [content, setContent] = useState('');
  const [notePreviewTab, setNotePreviewTab] = useState<'split' | 'edit' | 'preview'>('split');
  // Hackathon fields
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [hackathonStatus, setHackathonStatus] = useState<HackathonStatus>('Interested');
  const [teamInput, setTeamInput] = useState('');
  // Common metadata
  const [collectionId, setCollectionId] = useState('col-general');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#F4845F');
  const [pinned, setPinned] = useState(false);
  const [favourite, setFavourite] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingItem) {
      setType(editingItem.type);
      setTitle(editingItem.title);
      setUrl(editingItem.url || '');
      setQuickPasteUrl(editingItem.url || '');
      setDescription(editingItem.description || '');
      setFavicon(editingItem.favicon || '');
      setOwnerRepo(editingItem.ownerRepo || '');
      setStars(editingItem.stars || 0);
      setLanguage(editingItem.language || '');
      setLastUpdated(editingItem.lastUpdated || '');
      setNotes(editingItem.notes || '');
      setReadmePreview(editingItem.readmePreview || '');
      setContent(editingItem.content || '');
      setStartDate(
        editingItem.startDate ? editingItem.startDate.slice(0, 16) : ''
      );
      setDeadline(
        editingItem.deadline ? editingItem.deadline.slice(0, 16) : ''
      );
      setHackathonStatus(editingItem.hackathonStatus || 'Interested');
      setTeamInput((editingItem.teamMembers || []).join(', '));
      setCollectionId(editingItem.collectionId || 'col-general');
      setSelectedTags(editingItem.tags || []);
      setPinned(Boolean(editingItem.pinned));
      setFavourite(Boolean(editingItem.favourite));
    } else {
      setType(initialType);
      setQuickPasteUrl('');
      setTitle('');
      setUrl('');
      setDescription('');
      setFavicon('');
      setOwnerRepo('');
      setStars(0);
      setLanguage('');
      setLastUpdated('');
      setNotes('');
      setReadmePreview('');
      setContent('# New Note\n\nWrite your thoughts in **Markdown**...');
      setStartDate('');
      setDeadline('');
      setHackathonStatus('Interested');
      setTeamInput('');
      setCollectionId(collections[0]?.id || 'col-general');
      setSelectedTags([]);
      setPinned(false);
      setFavourite(false);
    }
  }, [isOpen, editingItem, initialType, collections]);

  if (!isOpen) return null;

  const sectionTheme =
    SECTIONS.find((s) => s.id === type) || SECTIONS[0];

  const duplicateItem = findDuplicateUrlItem(
    existingItems,
    url,
    editingItem?.id
  );

  const handleSmartUrlChange = async (raw: string) => {
    setQuickPasteUrl(raw);
    setUrl(raw);
    if (!raw.trim()) return;
    const detected = detectUrlType(raw);
    if (!editingItem) {
      setType(detected.type);
    }
    if (!title.trim()) {
      setTitle(detected.suggestedTitle);
    }
    if (detected.type === 'github' && detected.ownerRepo) {
      setOwnerRepo(detected.ownerRepo);
    }
  };

  const handleFetchOnlineDetails = async () => {
    const targetUrl = url.trim() || ownerRepo.trim();
    if (!targetUrl) return;
    setFetchingMeta(true);
    try {
      const detected = detectUrlType(targetUrl);
      if (detected.type === 'github' || type === 'github') {
        const repoPair = detected.ownerRepo || ownerRepo || targetUrl;
        const meta = await fetchGitHubRepoMeta(repoPair);
        if (meta) {
          setType('github');
          setOwnerRepo(meta.ownerRepo);
          setTitle(meta.title);
          setUrl(`https://github.com/${meta.ownerRepo}`);
          if (meta.description) setDescription(meta.description);
          setStars(meta.stars);
          setLanguage(meta.language);
          setLastUpdated(meta.lastUpdated);
          if (meta.readmePreview) setReadmePreview(meta.readmePreview);
        }
      } else {
        const webMeta = await fetchWebsiteMetadata(detected.normalizedHref);
        if (webMeta.title && !title.trim()) {
          setTitle(webMeta.title);
        }
        setFavicon(webMeta.favicon);
      }
    } finally {
      setFetchingMeta(false);
    }
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  const handleAddCustomTag = async () => {
    const clean = newTagName.trim().toLowerCase();
    if (!clean) return;
    if (!tags.some((t) => t.name.toLowerCase() === clean)) {
      await onCreateTag(clean, newTagColor);
    }
    if (!selectedTags.includes(clean)) {
      setSelectedTags((prev) => [...prev, clean]);
    }
    setNewTagName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const finalTitle = title.trim() || ownerRepo.trim();
    if (!finalTitle) {
      setError('Title or name is required.');
      return;
    }

    if ((type === 'link' || type === 'github') && !url.trim() && !ownerRepo.trim()) {
      setError('Please provide a URL or repository name.');
      return;
    }

    const nowIso = new Date().toISOString();
    const resolvedUrl =
      type === 'github' && !url.trim() && ownerRepo.trim()
        ? `https://github.com/${ownerRepo.trim()}`
        : url.trim() || undefined;

    const item: VaultItem = {
      id: editingItem?.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: finalTitle,
      url: resolvedUrl,
      description: description.trim() || undefined,
      favicon:
        type === 'link'
          ? favicon || generateLocalFaviconSvgDataUri(resolvedUrl || finalTitle)
          : undefined,
      ownerRepo: type === 'github' ? ownerRepo.trim() || finalTitle : undefined,
      stars: type === 'github' ? Number(stars) || 0 : undefined,
      language: type === 'github' ? language.trim() || 'Code' : undefined,
      lastUpdated:
        type === 'github' ? lastUpdated || nowIso : undefined,
      notes: type === 'github' ? notes.trim() || undefined : undefined,
      readmePreview:
        type === 'github' ? readmePreview || undefined : undefined,
      content: type === 'note' ? content : undefined,
      startDate:
        type === 'hackathon' && startDate
          ? new Date(startDate).toISOString()
          : undefined,
      deadline:
        type === 'hackathon' && deadline
          ? new Date(deadline).toISOString()
          : undefined,
      hackathonStatus: type === 'hackathon' ? hackathonStatus : undefined,
      teamMembers:
        type === 'hackathon'
          ? teamInput
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      tags: selectedTags,
      collectionId,
      pinned,
      favourite,
      archived: editingItem?.archived || false,
      trashed: editingItem?.trashed || false,
      createdAt: editingItem?.createdAt || nowIso,
      updatedAt: nowIso,
      openCount: editingItem?.openCount || 0,
      deadLinkStatus: editingItem?.deadLinkStatus || 'unknown',
    };

    await onSave(item);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingItem ? 'Edit Vault Item' : 'Quick Add to Vault'}
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl border-2 border-zinc-950 p-5 sm:p-7 text-zinc-950 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: sectionTheme.panel,
          transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
              {editingItem ? 'Update Encrypted Record' : 'Quick Add · Auto-Detect'}
            </span>
            <h2 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight text-zinc-950 leading-none mt-0.5">
              {editingItem ? `EDIT ${sectionTheme.singularLabel}` : `NEW ${sectionTheme.singularLabel}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 rounded-full border-2 border-zinc-950 flex items-center justify-center hover:bg-black/10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Item Type Segmented Control */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-black/15 mb-5">
          {(
            [
              { id: 'link', label: 'Website Link', icon: Globe },
              { id: 'github', label: 'GitHub Repo', icon: Github },
              { id: 'note', label: 'Markdown Note', icon: FileText },
              { id: 'hackathon', label: 'Hackathon', icon: Trophy },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = type === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setType(tab.id)}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-zinc-950 text-white shadow'
                    : 'text-zinc-900 hover:bg-black/10'
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Smart URL Paste / Auto-Detect Bar for Link, GitHub, or Hackathon */}
          {type !== 'note' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="item-url-input"
                  className="text-xs font-bold uppercase tracking-wider text-zinc-900"
                >
                  {type === 'github'
                    ? 'Paste GitHub URL or owner/repo'
                    : 'URL (Paste to auto-detect Link or GitHub Repo)'}
                </label>
                {isOnline && (
                  <button
                    type="button"
                    onClick={handleFetchOnlineDetails}
                    disabled={fetchingMeta}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-zinc-950 underline hover:opacity-75 cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>
                      {fetchingMeta ? 'Fetching metadata...' : 'Auto-Fetch Metadata'}
                    </span>
                  </button>
                )}
              </div>
              <input
                id="item-url-input"
                type="text"
                value={url || quickPasteUrl}
                onChange={(e) => handleSmartUrlChange(e.target.value)}
                placeholder={
                  type === 'github'
                    ? 'https://github.com/tauri-apps/tauri'
                    : 'https://example.com/resource'
                }
                className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2.5 text-sm font-medium text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-950"
              />
            </div>
          )}

          {/* Duplicate URL Warning */}
          {duplicateItem && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl bg-amber-950 text-amber-100 p-3.5 text-xs"
            >
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-300" />
              <div>
                <p className="font-bold uppercase tracking-wider">
                  Duplicate URL Detected in Vault
                </p>
                <p className="mt-0.5 opacity-90">
                  &ldquo;{duplicateItem.title}&rdquo; already uses this URL. You can still save if you want a second entry.
                </p>
              </div>
            </div>
          )}

          {/* Title / Name */}
          <div>
            <label
              htmlFor="item-title-input"
              className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
            >
              {type === 'hackathon'
                ? 'Hackathon Name'
                : type === 'github'
                ? 'Repository Title / Owner/Name'
                : 'Title'}
            </label>
            <input
              id="item-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'hackathon'
                  ? 'e.g. ETHGlobal / Local-First Builders Jam'
                  : type === 'github'
                  ? 'e.g. tauri-apps/tauri'
                  : 'Enter a clear title...'
              }
              required
              className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-950"
            />
          </div>

          {/* GitHub Specific Fields */}
          {type === 'github' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Owner / Name
                  </label>
                  <input
                    type="text"
                    value={ownerRepo}
                    onChange={(e) => setOwnerRepo(e.target.value)}
                    placeholder="owner/repo"
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-sm text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Language
                  </label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="Rust, TypeScript..."
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-sm text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Stars
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stars}
                    onChange={(e) => setStars(Number(e.target.value))}
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-sm text-zinc-950 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                  My Personal Notes on this Repo
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why I saved this repo, key crates/files, or integration notes..."
                  className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm text-zinc-950"
                />
              </div>
            </div>
          )}

          {/* Note Markdown Editor with Live Preview */}
          {type === 'note' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                  Markdown Note Editor &amp; Live Preview
                </label>
                <div className="inline-flex rounded-lg bg-black/15 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setNotePreviewTab('edit')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      notePreviewTab === 'edit' ? 'bg-zinc-950 text-white' : ''
                    }`}
                  >
                    <Edit3 size={12} className="inline mr-1" />
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotePreviewTab('split')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      notePreviewTab === 'split' ? 'bg-zinc-950 text-white' : ''
                    }`}
                  >
                    Split
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotePreviewTab('preview')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      notePreviewTab === 'preview' ? 'bg-zinc-950 text-white' : ''
                    }`}
                  >
                    <Eye size={12} className="inline mr-1" />
                    Preview
                  </button>
                </div>
              </div>

              <div
                className={`grid gap-3 ${
                  notePreviewTab === 'split' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {notePreviewTab !== 'preview' && (
                  <textarea
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="# Heading&#10;- [ ] Checklist item&#10;**Bold** and `inline code`"
                    className="w-full rounded-xl bg-white/95 border-2 border-zinc-950/20 p-3.5 font-mono text-xs sm:text-sm text-zinc-950 focus:outline-none focus:border-zinc-950"
                  />
                )}
                {notePreviewTab !== 'edit' && (
                  <div
                    className="rounded-xl bg-white/85 border-2 border-zinc-950/15 p-3.5 overflow-y-auto max-h-60 text-zinc-950"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownToHtml(content),
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Hackathon Specific Fields */}
          {type === 'hackathon' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Status
                  </label>
                  <select
                    value={hackathonStatus}
                    onChange={(e) =>
                      setHackathonStatus(e.target.value as HackathonStatus)
                    }
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-sm font-semibold text-zinc-950"
                  >
                    {HACKATHON_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium text-zinc-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                    Submission Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3 py-2 text-xs font-medium text-zinc-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                  Team Members (comma separated)
                </label>
                <input
                  type="text"
                  value={teamInput}
                  onChange={(e) => setTeamInput(e.target.value)}
                  placeholder="Alex, Jordan, Sam"
                  className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm text-zinc-950"
                />
              </div>
            </div>
          )}

          {/* Description (for Link, GitHub, Hackathon) */}
          {type !== 'note' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1">
                Description / Summary
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary or key takeaway..."
                className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2 text-sm text-zinc-950"
              />
            </div>
          )}

          {/* Collection & Pin/Favourite */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="item-collection-select"
                className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1"
              >
                Collection (Folder)
              </label>
              <select
                id="item-collection-select"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full rounded-xl bg-white/90 border-2 border-zinc-950/20 px-3.5 py-2.5 text-sm font-semibold text-zinc-950"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="w-4 h-4 rounded accent-zinc-950"
                />
                <span>Pin to top</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={favourite}
                  onChange={(e) => setFavourite(e.target.checked)}
                  className="w-4 h-4 rounded accent-zinc-950"
                />
                <span>Favourite</span>
              </label>
            </div>
          </div>

          {/* Coloured Tags Selector + Creator */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-900 mb-1.5">
              Coloured Tags
            </span>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {tags.map((t) => {
                const active = selectedTags.includes(t.name);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.name)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-zinc-950 text-white ring-2 ring-zinc-950'
                        : 'bg-white/75 text-zinc-900 hover:bg-white'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span>#{t.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                aria-label="New tag color"
                className="w-8 h-8 rounded cursor-pointer border border-zinc-950/30 bg-transparent"
              />
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Add new tag..."
                className="rounded-lg bg-white/80 border border-zinc-950/20 px-2.5 py-1 text-xs font-medium text-zinc-950"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 text-white px-2.5 py-1 text-xs font-bold cursor-pointer"
              >
                <Plus size={12} />
                <span>Add Tag</span>
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-950 text-red-100 px-3.5 py-2 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-950/15">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border-2 border-zinc-950/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-950 hover:bg-black/10 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 text-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
            >
              {editingItem ? 'Save Changes' : 'Encrypt & Save to Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
