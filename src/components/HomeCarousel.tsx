import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Plus,
  Search,
  Settings,
  Download,
  Smartphone,
  MonitorDown,
  ClipboardPaste,
} from 'lucide-react';
import { SECTIONS } from '../constants/sections';
import { CarouselRole, ItemType, VaultItem } from '../types/vault';
import {
  getCarouselRole,
  getNextCarouselIndex,
  isBackupOverdue,
} from '../utils/vaultLogic';
import { GrainOverlay } from './GrainOverlay';

interface HomeCarouselProps {
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  items: VaultItem[];
  lastBackupAt?: string;
  isPWAInstallable: boolean;
  onInstallPWA: () => void;
  onOpenSection: (type: ItemType) => void;
  onOpenQuickAdd: (defaultType?: ItemType) => void;
  onOpenSearch: () => void;
  onOpenPortability: () => void;
  onOpenPasteModal?: () => void;
  onOpenSettings: () => void;
  onOpenDownloadModal: () => void;
  onLockVault: () => void;
}

export const HomeCarousel: React.FC<HomeCarouselProps> = ({
  activeIndex,
  setActiveIndex,
  items,
  lastBackupAt,
  isPWAInstallable,
  onInstallPWA,
  onOpenSection,
  onOpenQuickAdd,
  onOpenSearch,
  onOpenPortability,
  onOpenPasteModal,
  onOpenSettings,
  onOpenDownloadModal,
  onLockVault,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const animTimeoutRef = useRef<number | null>(null);

  // Preload all 4 character PNGs on mount with new Image()
  useEffect(() => {
    SECTIONS.forEach((sec) => {
      const img = new Image();
      img.src = sec.image;
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) {
        window.clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  const navigate = useCallback(
    (direction: 'next' | 'prev') => {
      setIsAnimating(true);
      setActiveIndex((prev) => getNextCarouselIndex(prev, direction));
      if (animTimeoutRef.current) {
        window.clearTimeout(animTimeoutRef.current);
      }
      animTimeoutRef.current = window.setTimeout(() => {
        setIsAnimating(false);
      }, 420);
    },
    [setActiveIndex]
  );

  // Left and right arrow keys on the home screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate('next');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate('prev');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const activeSection = SECTIONS[activeIndex] || SECTIONS[0];

  const sectionItems = items
    .filter((i) => !i.trashed && !i.archived && i.type === activeSection.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const recentThree = sectionItems.slice(0, 3);
  const backupDue = isBackupOverdue(lastBackupAt);

  const getRoleStyles = (role: CarouselRole): React.CSSProperties => {
    const smoothSpring = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const baseTransition = [
      `transform 450ms ${smoothSpring}`,
      `filter 450ms ${smoothSpring}`,
      `opacity 450ms ${smoothSpring}`,
      `left 450ms ${smoothSpring}`,
      `height 450ms ${smoothSpring}`,
      `bottom 450ms ${smoothSpring}`,
    ].join(', ');

    switch (role) {
      case 'center':
        return {
          aspectRatio: '0.6 / 1',
          left: '50%',
          height: isMobile ? '60%' : '92%',
          bottom: isMobile ? '22%' : '0%',
          transform: `translate3d(-50%, 0, 0) scale(${isMobile ? 1.25 : 1.68})`,
          filter: 'blur(0px)',
          opacity: 1,
          zIndex: 20,
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'left':
        return {
          aspectRatio: '0.6 / 1',
          left: isMobile ? '20%' : '30%',
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
          transform: 'translate3d(-50%, 0, 0) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'right':
        return {
          aspectRatio: '0.6 / 1',
          left: isMobile ? '80%' : '70%',
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
          transform: 'translate3d(-50%, 0, 0) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'back':
      default:
        return {
          aspectRatio: '0.6 / 1',
          left: '50%',
          height: isMobile ? '13%' : '22%',
          bottom: isMobile ? '32%' : '12%',
          transform: 'translate3d(-50%, 0, 0) scale(1)',
          filter: 'blur(4px)',
          opacity: 0.75,
          zIndex: 5,
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
    }
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden select-none"
      style={{
        backgroundColor: activeSection.bg,
        transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Grain Overlay (z 50) */}
      <GrainOverlay className="absolute inset-0 pointer-events-none z-50" />

      {/* Top-Left Brand Title (z 60) */}
      <div className="absolute top-6 left-4 sm:left-10 z-60 flex items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white opacity-90 whitespace-nowrap">
          GUARDIAN VAULT
        </span>
      </div>

      {/* Top-Right Controls (z 60) */}
      <div className="absolute top-5 right-4 sm:right-10 z-60 flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search vault (Ctrl+K)"
          className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-black/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Search size={15} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[11px] opacity-80 font-mono">
            Ctrl+K
          </kbd>
        </button>

        {onOpenPasteModal && (
          <button
            type="button"
            onClick={onOpenPasteModal}
            aria-label="Paste or Import into Vault"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ClipboardPaste size={15} />
            <span className="hidden md:inline">Paste / Import</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPortability}
          aria-label="Backup, Export and Import Vault"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Download size={15} />
          <span className="hidden md:inline">
            {backupDue ? 'Backup Due' : 'Transfer / Export'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenDownloadModal}
          aria-label="Download Guardian Vault for Windows, Linux, macOS, or Android"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
        >
          <MonitorDown size={15} />
          <span className="hidden lg:inline">Download App</span>
        </button>

        {isPWAInstallable && (
          <button
            type="button"
            onClick={onInstallPWA}
            aria-label="Install Guardian Vault App"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Smartphone size={15} />
            <span className="hidden lg:inline">Install PWA</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Vault Settings"
          className="inline-flex items-center justify-center rounded-xl border border-white/40 bg-black/15 p-2 text-white hover:bg-white/15 transition-colors cursor-pointer"
        >
          <Settings size={16} />
        </button>

        <button
          type="button"
          onClick={onLockVault}
          aria-label="Lock Vault"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-black/20 px-3 py-2 text-xs font-semibold text-white hover:bg-black/35 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Lock size={15} />
          <span className="hidden sm:inline">Lock</span>
        </button>
      </div>

      {/* Giant Ghost Text (z 2, behind characters) */}
      <div
        aria-hidden="true"
        className="font-anton absolute left-1/2 -translate-x-1/2 text-white uppercase whitespace-nowrap pointer-events-none"
        style={{
          top: '18%',
          zIndex: 2,
          fontSize: 'clamp(90px, 28vw, 380px)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {activeSection.ghostText}
      </div>

      {/* 3D Character Carousel (absolute inset-0, z 3) */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        {SECTIONS.map((sec, idx) => {
          const role = getCarouselRole(idx, activeIndex);
          const roleStyles = getRoleStyles(role);
          return (
            <div
              key={sec.id}
              data-testid={`carousel-item-${sec.id}`}
              data-role={role}
              role="button"
              tabIndex={0}
              aria-label={
                role === 'center'
                  ? `Open ${sec.name} section`
                  : `Rotate to ${sec.name} section`
              }
              title={
                role === 'center'
                  ? `Click to open ${sec.name}`
                  : `Click to rotate to ${sec.name}`
              }
              onClick={() => {
                if (role === 'left') navigate('prev');
                else if (role === 'right') navigate('next');
                else if (role === 'center') onOpenSection(sec.id);
                else setActiveIndex(idx);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (role === 'left') navigate('prev');
                  else if (role === 'right') navigate('next');
                  else if (role === 'center') onOpenSection(sec.id);
                  else setActiveIndex(idx);
                }
              }}
              className="group absolute pointer-events-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-3xl"
              style={roleStyles}
            >
              <img
                src={sec.image}
                alt={sec.name}
                draggable={false}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain object-bottom select-none transition-transform duration-200 ease-out group-hover:scale-[1.03] group-active:scale-95"
              />
            </div>
          );
        })}
      </div>

      {/* Floating "+ Quick add" Button (z 60) */}
      <div className="absolute right-4 sm:right-24 bottom-20 sm:bottom-38 z-60">
        <button
          type="button"
          onClick={() => onOpenQuickAdd(activeSection.id)}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-950 text-white border-2 border-white/25 px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-xl hover:scale-105 transition-transform duration-150 cursor-pointer whitespace-nowrap"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Quick add</span>
        </button>
      </div>

      {/* Bottom-Left Info + Circular Prev/Next Buttons (z 60) */}
      <div className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24 z-60 max-w-[320px] text-white">
        <h2 className="font-bold uppercase text-base sm:text-[22px] tracking-wide leading-tight">
          {activeSection.name}
        </h2>
        <p className="text-sm sm:text-base font-medium text-white/90 tabular-nums mt-0.5">
          {sectionItems.length} {activeSection.countLabel}
        </p>

        {/* 3 Most Recent Item Titles (hidden on mobile) */}
        <div className="hidden sm:block mt-3 space-y-1">
          {recentThree.length > 0 ? (
            recentThree.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenSection(activeSection.id)}
                className="block max-w-full truncate text-left text-xs font-medium text-white/85 hover:text-white hover:underline cursor-pointer"
              >
                · {item.title}
              </button>
            ))
          ) : (
            <p className="text-xs text-white/75 italic">
              No items in {activeSection.name.toLowerCase()} yet.
            </p>
          )}
        </div>

        {/* Two Circular Navigation Buttons */}
        <div className="mt-4 sm:mt-6 flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => navigate('prev')}
            aria-label="Previous section"
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-white bg-transparent text-white flex items-center justify-center transition-all duration-150 hover:scale-[1.08] hover:bg-white/12 cursor-pointer"
          >
            <ArrowLeft size={26} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={() => navigate('next')}
            aria-label="Next section"
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-white bg-transparent text-white flex items-center justify-center transition-all duration-150 hover:scale-[1.08] hover:bg-white/12 cursor-pointer"
          >
            <ArrowRight size={26} strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Bottom-Right Big Anton CTA Link (z 60) */}
      <div className="absolute bottom-6 right-4 sm:bottom-20 sm:right-24 z-60">
        <button
          type="button"
          onClick={() => onOpenSection(activeSection.id)}
          className="font-anton group inline-flex items-center gap-2 sm:gap-3 text-white uppercase tracking-tight leading-none hover:opacity-90 transition-transform duration-150 hover:translate-x-1 cursor-pointer"
          style={{
            fontSize: 'clamp(20px, 4vw, 56px)',
          }}
        >
          <span>{activeSection.openCta}</span>
          <ArrowRight
            size={isMobile ? 24 : 40}
            strokeWidth={2.5}
            className="transition-transform duration-150 group-hover:translate-x-1"
          />
        </button>
      </div>
    </div>
  );
};
