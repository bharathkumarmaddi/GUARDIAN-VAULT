import React, { useMemo } from 'react';
import {
  X,
  Download,
  Monitor,
  Smartphone,
  Terminal,
  Laptop,
  Usb,
  ExternalLink,
} from 'lucide-react';
import { SECTIONS } from '../constants/sections';
import {
  detectVisitorOS,
  generateStandaloneHtml,
  VisitorOS,
} from '../utils/vaultLogic';

interface DownloadModalProps {
  isOpen: boolean;
  activeSectionIndex: number;
  onClose: () => void;
}

interface PlatformDownloadInfo {
  id: VisitorOS | 'windows-portable' | 'linux-deb';
  osLabel: string;
  title: string;
  fileName: string;
  subtitle: string;
  href: string;
}
const APP_VERSION = '2.0.0';
const GITHUB_REPO =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() ||
  'bharathkumarmaddi/GUARDIAN-VAULT';
const RELEASE_BASE = `https://github.com/${GITHUB_REPO}/releases/latest/download`;

const PLATFORM_ASSETS: PlatformDownloadInfo[] = [
  {
    id: 'windows',
    osLabel: 'Windows (Installer)',
    title: 'Download for Windows (.exe)',
    fileName: 'Guardian-Vault-Windows-Setup.exe',
    subtitle: 'Windows 10 / 11 (x64 NSIS Installer)',
    href: `${RELEASE_BASE}/Guardian-Vault-Windows-Setup.exe`,
  },
  {
    id: 'windows-portable',
    osLabel: 'Windows (USB Pendrive Portable)',
    title: 'Download Windows Portable (.exe)',
    fileName: 'Guardian-Vault-Windows-Portable.exe',
    subtitle: 'Stores data in GuardianData folder next to executable',
    href: `${RELEASE_BASE}/Guardian-Vault-Windows-Portable.exe`,
  },
  {
    id: 'linux',
    osLabel: 'Linux (Universal AppImage)',
    title: 'Download for Linux (.AppImage)',
    fileName: 'Guardian-Vault-Linux.AppImage',
    subtitle: 'Runs on any Linux distro & supports GuardianData portable mode',
    href: `${RELEASE_BASE}/Guardian-Vault-Linux.AppImage`,
  },
  {
    id: 'linux-deb',
    osLabel: 'Ubuntu / Debian (.deb)',
    title: 'Download for Ubuntu / Debian (.deb)',
    fileName: 'Guardian-Vault-Linux.deb',
    subtitle: 'Debian & Ubuntu package installer',
    href: `${RELEASE_BASE}/Guardian-Vault-Linux.deb`,
  },
  {
    id: 'macos',
    osLabel: 'macOS (.dmg)',
    title: 'Download for macOS (.dmg)',
    fileName: 'Guardian-Vault-macOS.dmg',
    subtitle: 'macOS 12+ Desktop Disk Image',
    href: `${RELEASE_BASE}/Guardian-Vault-macOS.dmg`,
  },
  {
    id: 'ios',
    osLabel: 'iPhone / iPad (PWA)',
    title: 'Install on iPhone / iPad (Share → Add to Home Screen)',
    fileName: 'Offline PWA',
    subtitle: 'Open in Safari, tap Share, and choose Add to Home Screen',
    href: '#install-pwa',
  },
];
 

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  activeSectionIndex,
  onClose,
}) => {
  const detectedOs = useMemo(() => detectVisitorOS(), []);

  if (!isOpen) return null;

  const section = SECTIONS[activeSectionIndex % 4] || SECTIONS[0];
  const primaryAsset =
    PLATFORM_ASSETS.find((a) => a.id === detectedOs) || PLATFORM_ASSETS[0];
  const otherAssets = PLATFORM_ASSETS.filter((a) => a.id !== primaryAsset.id);

  const getOsIcon = (id: string) => {
    if (id.startsWith('windows')) return <Monitor size={20} />;
    if (id.startsWith('linux')) return <Terminal size={20} />;
    if (id === 'macos') return <Laptop size={20} />;
    return <Smartphone size={20} />;
  };

  const handleDownloadPortableHtml = () => {
    const html = generateStandaloneHtml([], [], 'Guardian Vault — Portable Zero-Install');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guardian-vault-portable-${APP_VERSION}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Download Guardian Vault"
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border-2 border-zinc-950 p-5 sm:p-7 text-zinc-950 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-6"
        style={{ backgroundColor: section.panel }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-900/75">
              Native Desktop &amp; Mobile Releases · v{APP_VERSION}
            </span>
            <h2 className="font-anton text-3xl sm:text-4xl uppercase tracking-tight leading-none mt-0.5">
              DOWNLOAD GUARDIAN VAULT
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download page"
            className="w-10 h-10 rounded-full border-2 border-zinc-950 flex items-center justify-center hover:bg-black/10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Primary Detected OS Button */}
        <div
          data-testid="primary-os-download"
          className="rounded-3xl bg-zinc-950 text-white p-5 sm:p-6 space-y-4 border-2 border-zinc-950"
        >
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/75 font-bold">
            <span>Recommended for your device ({primaryAsset.osLabel})</span>
            <span>v{APP_VERSION}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-bold">
                {primaryAsset.fileName}
              </div>
              <p className="text-xs text-white/75 mt-1">
                {primaryAsset.subtitle}
              </p>
            </div>
            <a
              href={primaryAsset.href}
              target={primaryAsset.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-sm font-bold uppercase tracking-wider text-zinc-950 transition-transform hover:scale-[1.02] shrink-0"
              style={{ backgroundColor: section.bg }}
            >
              <Download size={18} />
              <span>{primaryAsset.title}</span>
            </a>
          </div>
        </div>

        {/* Other Platforms */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-900">
            Other Platforms
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {otherAssets.map((asset) => (
              <a
                key={asset.id}
                href={asset.href}
                target={asset.href.startsWith('http') ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/85 border-2 border-zinc-950/20 p-3.5 hover:border-zinc-950 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-zinc-950 text-white flex items-center justify-center shrink-0">
                    {asset.id === 'windows-portable' ? (
                      <Usb size={18} />
                    ) : (
                      getOsIcon(asset.id)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-950 truncate">
                      {asset.osLabel}
                    </div>
                    <div className="text-[11px] text-zinc-700 truncate font-mono">
                      {asset.fileName}
                    </div>
                  </div>
                </div>
                <ExternalLink size={15} className="text-zinc-700 shrink-0" />
              </a>
            ))}
          </div>

          {/* Zero-Install USB Pendrive HTML */}
          <div className="mt-4 rounded-2xl bg-zinc-950 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white text-zinc-950 flex items-center justify-center shrink-0">
                <Usb size={20} />
              </div>
              <div>
                <div className="text-sm font-bold">Zero-Install USB Pendrive Edition</div>
                <div className="text-xs text-white/70">
                  Single self-contained .html file — double click on any computer to run offline with 0 dependencies
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownloadPortableHtml}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-zinc-200 transition-colors cursor-pointer shrink-0"
            >
              <Download size={14} />
              <span>Download HTML</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
