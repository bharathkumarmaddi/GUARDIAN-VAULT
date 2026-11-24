import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Globe,
  Github,
  FileText,
  Trophy,
  Plus,
  Lock,
  Download,
  ArrowRight,
  X,
} from 'lucide-react';
import { ItemType, VaultItem } from '../types/vault';
import { filterAndSortItems } from '../utils/vaultLogic';
import { SECTION_BY_TYPE } from '../constants/sections';

interface CommandPaletteProps {
  isOpen: boolean;
  items: VaultItem[];
  onClose: () => void;
  onSelectItem: (item: VaultItem) => void;
  onOpenSection: (type: ItemType) => void;
  onOpenQuickAdd: (type: ItemType) => void;
  onOpenPortability: () => void;
  onLockVault: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  items,
  onClose,
  onSelectItem,
  onOpenSection,
  onOpenQuickAdd,
  onOpenPortability,
  onLockVault,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const matchedItems = useMemo(() => {
    return filterAndSortItems(items, { query }).slice(0, 8);
  }, [items, query]);

  const quickActions = useMemo(
    () => [
      {
        id: 'act-add-link',
        label: 'New Website Link',
        action: () => {
          onClose();
          onOpenQuickAdd('link');
        },
      },
      {
        id: 'act-add-repo',
        label: 'New GitHub Repository',
        action: () => {
          onClose();
          onOpenQuickAdd('github');
        },
      },
      {
        id: 'act-add-note',
        label: 'New Markdown Note',
        action: () => {
          onClose();
          onOpenQuickAdd('note');
        },
      },
      {
        id: 'act-add-hack',
        label: 'New Hackathon Entry',
        action: () => {
          onClose();
          onOpenQuickAdd('hackathon');
        },
      },
      {
        id: 'act-export',
        label: 'Backup / Export Vault (.vault, JSON, HTML)',
        action: () => {
          onClose();
          onOpenPortability();
        },
      },
      {
        id: 'act-lock',
        label: 'Lock Vault Immediately',
        action: () => {
          onClose();
          onLockVault();
        },
      },
    ],
    [onClose, onOpenQuickAdd, onOpenPortability, onLockVault]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, matchedItems.length - 1))
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter' && matchedItems[selectedIndex]) {
        e.preventDefault();
        onSelectItem(matchedItems[selectedIndex]);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, matchedItems, selectedIndex, onSelectItem, onClose]);

  if (!isOpen) return null;

  const getTypeIcon = (type: ItemType) => {
    switch (type) {
      case 'github':
        return <Github size={16} />;
      case 'note':
        return <FileText size={16} />;
      case 'hackathon':
        return <Trophy size={16} />;
      default:
        return <Globe size={16} />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette Search"
      className="fixed inset-0 z-80 flex items-start justify-center bg-black/75 backdrop-blur-sm p-4 pt-16 sm:pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-zinc-950 border-2 border-white/25 text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/15">
          <Search size={20} className="text-white/70 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Fuzzy search titles, URLs, #tags, GitHub repos, or markdown notes..."
            autoFocus
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-white/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 text-white/60 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4">
          <div>
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/50">
              Vault Items ({matchedItems.length})
            </div>
            {matchedItems.length > 0 ? (
              <div className="space-y-1 mt-1">
                {matchedItems.map((item, idx) => {
                  const sec = SECTION_BY_TYPE[item.type];
                  const active = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectItem(item);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${
                        active ? 'bg-white/15' : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-950 shrink-0"
                          style={{ backgroundColor: sec.bg }}
                        >
                          {getTypeIcon(item.type)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-xs text-white/65 truncate">
                            {sec.name}
                            {item.url ? ` · ${item.url}` : ''}
                            {item.tags.length
                              ? ` · #${item.tags.join(' #')}`
                              : ''}
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={15} className="text-white/50 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-3 py-4 text-xs text-white/60">
                No matching items found for &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white/50">
              Quick Commands
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
              {quickActions.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={qa.action}
                  className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-white/85 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <span>{qa.label}</span>
                  <ArrowRight size={13} className="opacity-60" />
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3 flex flex-wrap items-center justify-between gap-2 px-3 text-[11px] text-white/55">
            <span>
              Shortcuts: <kbd className="font-mono">N</kbd> New ·{' '}
              <kbd className="font-mono">/</kbd> or{' '}
              <kbd className="font-mono">Ctrl+K</kbd> Search ·{' '}
              <kbd className="font-mono">Esc</kbd> Close
            </span>
            <div className="flex items-center gap-2">
              {(['link', 'github', 'note', 'hackathon'] as ItemType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSection(t);
                    }}
                    className="underline hover:text-white uppercase cursor-pointer"
                  >
                    Open {t}s
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
