import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Share2, Copy, Check, QrCode, ExternalLink, Sparkles } from 'lucide-react';
import { VaultItem } from '../types/vault';
import { SECTION_BY_TYPE } from '../constants/sections';
import {
  copyItemsToUniversalClipboard,
  encodeQrTransferString,
} from '../utils/universalTransfer';

interface QrShareModalProps {
  item: VaultItem | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const QrShareModal: React.FC<QrShareModalProps> = ({
  item,
  onClose,
  onToast,
}) => {
  const [qrMode, setQrMode] = useState<'url' | 'gvault'>('url');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedGvault, setCopiedGvault] = useState(false);

  const shareText = item
    ? `${item.title}${item.url ? `\n${item.url}` : ''}${
        item.description ? `\n${item.description}` : ''
      }`
    : '';
  const targetUrl = item?.url || shareText;

  useEffect(() => {
    if (!item) return;
    let active = true;
    (async () => {
      try {
        const payload =
          qrMode === 'gvault'
            ? await encodeQrTransferString([item])
            : targetUrl || item.title;
        const url = await QRCode.toDataURL(payload, {
          width: 260,
          margin: 2,
          color: {
            dark: '#18181b',
            light: '#ffffff',
          },
        });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setQrDataUrl('');
      }
    })();
    return () => {
      active = false;
    };
  }, [item, targetUrl, qrMode]);

  if (!item) return null;

  const sec = SECTION_BY_TYPE[item.type];

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.description || item.title,
          url: item.url,
        });
        onToast('Shared successfully');
        return;
      } catch {
        // Fallback to copy
      }
    }
    handleCopyLink();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(item.url || shareText);
      setCopiedLink(true);
      onToast('Copied URL to clipboard');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast('Failed to copy');
    }
  };

  const handleCopyUniversalGvault = async () => {
    try {
      await copyItemsToUniversalClipboard([item]);
      setCopiedGvault(true);
      onToast(
        `1 item copied to universal clipboard (.gvault + URL). Switch devices and paste to transfer.`
      );
      setTimeout(() => setCopiedGvault(false), 2000);
    } catch {
      onToast('Failed to copy universal transfer data');
    }
  };

  const encodedText = encodeURIComponent(shareText);
  const encodedTitle = encodeURIComponent(item.title);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="QR Code and Share Item"
      className="fixed inset-0 z-80 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border-2 border-zinc-950 p-6 text-zinc-950 shadow-2xl"
        style={{ backgroundColor: sec.panel }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <QrCode size={20} />
            <h3 className="font-anton text-2xl uppercase tracking-tight">
              QR CODE &amp; UNIVERSAL SHARE
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR and Share modal"
            className="w-9 h-9 rounded-full border-2 border-zinc-950 flex items-center justify-center hover:bg-black/10 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm font-bold text-zinc-950 truncate mb-0.5">
          {item.title}
        </p>
        {item.url && (
          <p className="text-xs text-zinc-800 truncate mb-3">{item.url}</p>
        )}

        {/* Mode Switcher: Standard URL vs Guardian Vault Transfer QR */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/15 mb-3">
          <button
            type="button"
            onClick={() => setQrMode('url')}
            className={`py-1.5 rounded-lg text-[11px] font-bold uppercase cursor-pointer ${
              qrMode === 'url'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-900 hover:bg-black/10'
            }`}
          >
            Standard Link QR
          </button>
          <button
            type="button"
            onClick={() => setQrMode('gvault')}
            className={`py-1.5 rounded-lg text-[11px] font-bold uppercase cursor-pointer ${
              qrMode === 'gvault'
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-900 hover:bg-black/10'
            }`}
          >
            .gvault Transfer QR
          </button>
        </div>

        {qrDataUrl && (
          <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-4 border-2 border-zinc-950 mb-4">
            <img
              src={qrDataUrl}
              alt={`QR Code for ${item.title}`}
              className="w-52 h-52 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-[11px] font-medium text-zinc-600 mt-2 text-center">
              {qrMode === 'gvault'
                ? 'Scan inside Guardian Vault on another device to import full record & tags'
                : 'Scan with any phone camera to open URL directly'}
            </span>
          </div>
        )}

        <div className="space-y-2 mb-3">
          <button
            type="button"
            onClick={handleCopyUniversalGvault}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-950 text-white py-2.5 px-4 text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 cursor-pointer"
          >
            {copiedGvault ? <Check size={15} /> : <Sparkles size={15} />}
            <span>
              {copiedGvault
                ? 'Copied Universal .gvault!'
                : 'Copy Universal .gvault Item'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex items-center justify-center gap-2 rounded-xl bg-white border-2 border-zinc-950 text-zinc-950 py-2 px-3 text-xs font-bold uppercase tracking-wider hover:bg-zinc-100 cursor-pointer"
            >
              <Share2 size={14} />
              <span>Web Share</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-2 rounded-xl bg-white border-2 border-zinc-950 text-zinc-950 py-2 px-3 text-xs font-bold uppercase tracking-wider hover:bg-zinc-100 cursor-pointer"
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedLink ? 'Copied URL!' : 'Copy Plain URL'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-950/15 text-xs font-bold">
          <a
            href={`https://wa.me/?text=${encodedText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 rounded-xl bg-black/15 py-2 px-3 hover:bg-black/25 text-center"
          >
            <span>WhatsApp</span>
            <ExternalLink size={12} />
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(
              item.url || ''
            )}&text=${encodedTitle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 rounded-xl bg-black/15 py-2 px-3 hover:bg-black/25 text-center"
          >
            <span>Telegram</span>
            <ExternalLink size={12} />
          </a>
          <a
            href={`mailto:?subject=${encodedTitle}&body=${encodedText}`}
            className="flex items-center justify-center gap-1 rounded-xl bg-black/15 py-2 px-3 hover:bg-black/25 text-center"
          >
            <span>Email</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
};
