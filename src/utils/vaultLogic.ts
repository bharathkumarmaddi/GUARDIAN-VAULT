import {
  CarouselRole,
  ItemType,
  PasswordStrengthResult,
  SortOption,
  VaultCollection,
  VaultItem,
} from '../types/vault';

export const MIN_SETUP_PASSWORD_LENGTH = 8;
export const MAX_PIN_ATTEMPTS = 5;

/**
 * Returns the growing delay (in milliseconds) after a failed PIN attempt.
 * Attempt 1 -> 1s, Attempt 2 -> 2s, Attempt 3 -> 4s, Attempt 4 -> 8s, Attempt 5+ -> locked out.
 */
export function getPinAttemptDelayMs(failedAttempts: number): number {
  if (failedAttempts <= 0) return 0;
  if (failedAttempts === 1) return 1000;
  if (failedAttempts === 2) return 2000;
  if (failedAttempts === 3) return 4000;
  return 8000;
}

/**
 * Extracts a numeric digit from physical keyboard key and code.
 * Supports number-row keys ('0'-'9') and numeric keypad ('Numpad0'-'Numpad9').
 */
export function parsePinKeyboardInput(key: string, code?: string): string | null {
  if (key >= '0' && key <= '9') return key;
  if (code && code.startsWith('Numpad') && code.length === 7) {
    const digit = code.slice(6);
    if (digit >= '0' && digit <= '9') return digit;
  }
  return null;
}

/**
 * Safely sanitizes pasted input for PIN entry:
 * Strips all non-digit characters and limits length to 4 digits.
 */
export function sanitizePastedPin(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '').slice(0, 4);
}

/**
 * Validates if PIN can be submitted (must be exactly 4 digits).
 */
export function canSubmitPin(pin: string): { canSubmit: boolean; error?: string } {
  if (!pin || pin.length < 4) {
    return { canSubmit: false, error: 'Please enter all 4 digits of your PIN.' };
  }
  if (pin.length > 4) {
    return { canSubmit: false, error: 'PIN must be exactly 4 digits.' };
  }
  return { canSubmit: true };
}


export type VisitorOS = 'windows' | 'linux' | 'macos' | 'android' | 'ios';

export function detectVisitorOS(
  userAgent?: string,
  platform?: string
): VisitorOS {
  const ua = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  ).toLowerCase();
  const plat = (
    platform ??
    (userAgent === undefined && typeof navigator !== 'undefined'
      ? navigator.platform
      : '')
  ).toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua) || (plat.includes('mac') && /mobile/.test(ua))) {
    return 'ios';
  }
  if (ua.includes('win') || plat.includes('win')) return 'windows';
  if (ua.includes('mac') || plat.includes('mac')) return 'macos';
  if (ua.includes('linux') || plat.includes('linux')) return 'linux';
  return 'windows';
}

export function evaluatePasswordStrength(
  password: string
): PasswordStrengthResult {
  const len = password.length;
  const meetsMinLength = len >= MIN_SETUP_PASSWORD_LENGTH;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const uniqueChars = new Set(password).size;
  const hasRepeatedRun = /(.)\1{3,}/.test(password);

  const tips: string[] = [];
  if (!meetsMinLength) {
    tips.push(
      `Use at least ${MIN_SETUP_PASSWORD_LENGTH} characters (${len}/${MIN_SETUP_PASSWORD_LENGTH})`
    );
  }
  if (!hasUpper || !hasLower) {
    tips.push('Mix uppercase and lowercase letters');
  }
  if (!hasDigit) {
    tips.push('Include at least one number');
  }
  if (!hasSymbol) {
    tips.push('Add a symbol (e.g. ! @ # $ % - _)');
  }
  if (len >= 8 && uniqueChars < 5) {
    tips.push('Avoid repeating the same characters');
  }

  if (len === 0) {
    return {
      score: 0,
      bars: 0,
      label: 'Too Short',
      meetsMinLength: false,
      isWeakWarning: false,
      tips,
    };
  }

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(
    Boolean
  ).length;

  let rawPoints = 0;
  if (len >= 8) rawPoints += 1;
  if (len >= 12) rawPoints += 1;
  if (len >= 16) rawPoints += 1;
  if (varietyCount >= 2) rawPoints += 1;
  if (varietyCount >= 3) rawPoints += 1;
  if (varietyCount === 4 && uniqueChars >= 7) rawPoints += 1;
  if (hasRepeatedRun || uniqueChars < 4) rawPoints = Math.max(1, rawPoints - 2);

  if (!meetsMinLength) {
    return {
      score: 1,
      bars: 1,
      label: 'Too Short',
      meetsMinLength: false,
      isWeakWarning: true,
      tips,
    };
  }

  if (rawPoints <= 2 || varietyCount <= 1 || uniqueChars < 4) {
    return {
      score: 1,
      bars: 1,
      label: 'Weak',
      meetsMinLength: true,
      isWeakWarning: true,
      tips,
    };
  }
  if (rawPoints === 3 || varietyCount === 2) {
    return {
      score: 2,
      bars: 2,
      label: 'Fair',
      meetsMinLength: true,
      isWeakWarning: false,
      tips,
    };
  }
  if (rawPoints === 4 || (rawPoints === 5 && len < 12)) {
    return {
      score: 3,
      bars: 3,
      label: 'Good',
      meetsMinLength: true,
      isWeakWarning: false,
      tips,
    };
  }

  return {
    score: 4,
    bars: 4,
    label: 'Strong',
    meetsMinLength: true,
    isWeakWarning: false,
    tips: [],
  };
}

export function getCarouselRole(itemIndex: number, activeIndex: number): CarouselRole {
  const normActive = ((activeIndex % 4) + 4) % 4;
  if (itemIndex === normActive) return 'center';
  if (itemIndex === (normActive + 3) % 4) return 'left';
  if (itemIndex === (normActive + 1) % 4) return 'right';
  return 'back';
}

export function getNextCarouselIndex(
  currentIndex: number,
  direction: 'next' | 'prev'
): number {
  const norm = ((currentIndex % 4) + 4) % 4;
  return direction === 'next' ? (norm + 1) % 4 : (norm + 3) % 4;
}

export function normalizeUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProto);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}${parsed.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

export interface DetectedUrlInfo {
  type: 'link' | 'github';
  normalizedHref: string;
  ownerRepo?: string;
  suggestedTitle: string;
}

export function detectUrlType(input: string): DetectedUrlInfo {
  const trimmed = input.trim();
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const segments = u.pathname.split('/').filter(Boolean);
    if (host === 'github.com' && segments.length >= 2) {
      const owner = segments[0];
      const repo = segments[1].replace(/\.git$/i, '');
      const ownerRepo = `${owner}/${repo}`;
      return {
        type: 'github',
        normalizedHref: `https://github.com/${ownerRepo}`,
        ownerRepo,
        suggestedTitle: ownerRepo,
      };
    }
    const cleanHost = host.replace(/\.[a-z]{2,}$/i, '');
    const titleGuess =
      segments.length > 0
        ? `${host} — ${segments[segments.length - 1].replace(/[-_]/g, ' ')}`
        : cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1);
    return {
      type: 'link',
      normalizedHref: u.toString(),
      suggestedTitle: titleGuess,
    };
  } catch {
    return {
      type: 'link',
      normalizedHref: href,
      suggestedTitle: trimmed,
    };
  }
}

export function findDuplicateUrlItem(
  items: VaultItem[],
  candidateUrl?: string,
  excludeItemId?: string
): VaultItem | undefined {
  const target = normalizeUrl(candidateUrl);
  if (!target) return undefined;
  return items.find(
    (item) =>
      !item.trashed &&
      item.id !== excludeItemId &&
      item.url &&
      normalizeUrl(item.url) === target
  );
}

export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  if (!target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 85;
  if (t.includes(q)) return 70;

  let qIdx = 0;
  let consecutive = 0;
  let score = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      consecutive++;
      score += 2 + consecutive * 2;
    } else {
      consecutive = 0;
    }
  }
  return qIdx === q.length ? score : 0;
}

export function scoreVaultItemQuery(item: VaultItem, query: string): number {
  if (!query.trim()) return 1;
  const fields = [
    { text: item.title, weight: 1.5 },
    { text: item.url || '', weight: 1.2 },
    { text: item.ownerRepo || '', weight: 1.3 },
    { text: item.tags.join(' '), weight: 1.3 },
    { text: item.description || '', weight: 1.0 },
    { text: item.notes || '', weight: 1.0 },
    { text: item.content || '', weight: 1.0 },
    { text: (item.teamMembers || []).join(' '), weight: 0.9 },
  ];
  let best = 0;
  for (const f of fields) {
    const s = fuzzyScore(query, f.text) * f.weight;
    if (s > best) best = s;
  }
  return best;
}

export interface FilterItemsOptions {
  type?: ItemType | 'all';
  query?: string;
  tag?: string | 'all';
  collectionId?: string | 'all';
  onlyPinned?: boolean;
  onlyFavourite?: boolean;
  viewState?: 'active' | 'archived' | 'trashed';
  sortBy?: SortOption;
}

export function filterAndSortItems(
  items: VaultItem[],
  opts: FilterItemsOptions
): VaultItem[] {
  const {
    type = 'all',
    query = '',
    tag = 'all',
    collectionId = 'all',
    onlyPinned = false,
    onlyFavourite = false,
    viewState = 'active',
    sortBy = 'newest',
  } = opts;

  const scored: Array<{ item: VaultItem; score: number }> = [];

  for (const item of items) {
    if (viewState === 'trashed') {
      if (!item.trashed) continue;
    } else if (viewState === 'archived') {
      if (item.trashed || !item.archived) continue;
    } else {
      if (item.trashed || item.archived) continue;
    }

    if (type !== 'all' && item.type !== type) continue;
    if (tag !== 'all' && !item.tags.includes(tag)) continue;
    if (collectionId !== 'all' && item.collectionId !== collectionId) continue;
    if (onlyPinned && !item.pinned) continue;
    if (onlyFavourite && !item.favourite) continue;

    const score = scoreVaultItemQuery(item, query);
    if (query.trim() && score <= 0) continue;

    scored.push({ item, score });
  }

  scored.sort((a, b) => {
    if (!query.trim() && a.item.pinned !== b.item.pinned) {
      return a.item.pinned ? -1 : 1;
    }
    if (query.trim() && b.score !== a.score) {
      return b.score - a.score;
    }
    switch (sortBy) {
      case 'az':
        return a.item.title.localeCompare(b.item.title);
      case 'updated':
        return new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
      case 'most_opened':
        return (b.item.openCount || 0) - (a.item.openCount || 0);
      case 'newest':
      default:
        return new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime();
    }
  });

  return scored.map((entry) => entry.item);
}

export function formatCountdown(
  deadlineIso?: string,
  nowMs: number = Date.now()
): { label: string; isUrgent: boolean; isPast: boolean } {
  if (!deadlineIso) {
    return { label: 'No deadline set', isUrgent: false, isPast: false };
  }
  const target = new Date(deadlineIso).getTime();
  if (Number.isNaN(target)) {
    return { label: 'Invalid date', isUrgent: false, isPast: false };
  }
  const diff = target - nowMs;
  if (diff <= 0) {
    return { label: 'Deadline passed', isUrgent: false, isPast: true };
  }
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return {
      label: `${days}d ${hours}h left`,
      isUrgent: days <= 2,
      isPast: false,
    };
  }
  return {
    label: `${hours}h ${mins}m left`,
    isUrgent: true,
    isPast: false,
  };
}

export function isBackupOverdue(
  lastBackupAt?: string,
  nowMs: number = Date.now()
): boolean {
  if (!lastBackupAt) return true;
  const last = new Date(lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return nowMs - last >= sevenDaysMs;
}

export function parseBookmarksHtml(html: string): Partial<VaultItem>[] {
  const results: Partial<VaultItem>[] = [];
  const anchorRegex = /<A\b[^>]*HREF=["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
    if (!rawHref || rawHref.startsWith('place:') || rawHref.startsWith('javascript:')) {
      continue;
    }
    const detected = detectUrlType(rawHref);
    results.push({
      type: detected.type,
      title: rawTitle || detected.suggestedTitle,
      url: detected.normalizedHref,
      ownerRepo: detected.ownerRepo,
      tags: ['imported'],
      collectionId: 'col-general',
    });
  }
  return results;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inCodeBlock = false;
  let listOpen = false;

  const formatInline = (text: string): string => {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-black/25 font-mono text-xs">$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    safe = safe.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline font-medium">$1</a>'
    );
    return safe;
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      if (listOpen) {
        htmlLines.push('</ul>');
        listOpen = false;
      }
      if (!inCodeBlock) {
        inCodeBlock = true;
        htmlLines.push('<pre class="p-3 my-2 rounded-lg bg-black/30 overflow-x-auto font-mono text-xs leading-relaxed"><code>');
      } else {
        inCodeBlock = false;
        htmlLines.push('</code></pre>');
      }
      continue;
    }

    if (inCodeBlock) {
      htmlLines.push(escapeHtml(rawLine));
      continue;
    }

    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (listOpen) {
        htmlLines.push('</ul>');
        listOpen = false;
      }
      htmlLines.push('<div class="h-2"></div>');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      if (listOpen) { htmlLines.push('</ul>'); listOpen = false; }
      htmlLines.push(`<h3 class="text-base font-bold mt-3 mb-1">${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      if (listOpen) { htmlLines.push('</ul>'); listOpen = false; }
      htmlLines.push(`<h2 class="text-lg font-bold mt-4 mb-1.5">${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      if (listOpen) { htmlLines.push('</ul>'); listOpen = false; }
      htmlLines.push(`<h1 class="text-xl font-bold mt-4 mb-2">${formatInline(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('- [x] ') || trimmed.startsWith('- [ ] ')) {
      if (!listOpen) {
        htmlLines.push('<ul class="space-y-1 my-1.5">');
        listOpen = true;
      }
      const checked = trimmed.startsWith('- [x] ');
      htmlLines.push(
        `<li class="flex items-center gap-2 text-sm"><span class="inline-block w-3.5 h-3.5 rounded border border-current flex items-center justify-center text-[10px]">${checked ? '✓' : ''}</span><span class="${checked ? 'line-through opacity-70' : ''}">${formatInline(trimmed.slice(6))}</span></li>`
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!listOpen) {
        htmlLines.push('<ul class="list-disc list-inside space-y-1 my-1.5">');
        listOpen = true;
      }
      htmlLines.push(`<li class="text-sm">${formatInline(trimmed.slice(2))}</li>`);
    } else if (trimmed.startsWith('> ')) {
      if (listOpen) { htmlLines.push('</ul>'); listOpen = false; }
      htmlLines.push(`<blockquote class="pl-3 italic opacity-85 my-2">${formatInline(trimmed.slice(2))}</blockquote>`);
    } else {
      if (listOpen) { htmlLines.push('</ul>'); listOpen = false; }
      htmlLines.push(`<p class="text-sm leading-relaxed my-1">${formatInline(trimmed)}</p>`);
    }
  }

  if (listOpen) htmlLines.push('</ul>');
  if (inCodeBlock) htmlLines.push('</code></pre>');
  return htmlLines.join('\n');
}

export function generateStandaloneHtml(
  items: VaultItem[],
  collections: VaultCollection[],
  exportTitle = 'Guardian Vault — Read-Only Snapshot'
): string {
  const colMap = new Map(collections.map((c) => [c.id, c.name]));
  const activeItems = items.filter((i) => !i.trashed);

  const cardsHtml = activeItems
    .map((item) => {
      const colName = colMap.get(item.collectionId) || 'General';
      const tagsText = item.tags.length ? item.tags.map(escapeHtml).join(' · ') : 'untagged';
      const urlHtml = item.url
        ? `<p style="margin:6px 0;"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="color:#18181b;font-weight:600;text-decoration:underline;">${escapeHtml(item.url)}</a></p>`
        : '';
      const bodyText = item.description || item.content || item.notes || '';
      return `<article style="background:#ffffff;border:2px solid #18181b;border-radius:16px;padding:20px;margin-bottom:16px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#52525b;margin-bottom:6px;">
          ${escapeHtml(item.type)} · ${escapeHtml(colName)} · ${tagsText}
        </div>
        <h2 style="font-size:20px;margin:0 0 8px 0;color:#18181b;">${escapeHtml(item.title)}</h2>
        ${urlHtml}
        ${bodyText ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;color:#27272a;margin:8px 0 0 0;">${escapeHtml(bodyText)}</pre>` : ''}
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(exportTitle)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F4845F; color: #18181b; margin: 0; padding: 32px 16px; }
    .container { max-width: 880px; margin: 0 auto; }
    header { background: #18181b; color: #ffffff; padding: 24px; border-radius: 20px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px 0; font-size: 28px; letter-spacing: 0.04em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(exportTitle)}</h1>
      <p style="margin:0;opacity:0.8;font-size:13px;">Exported ${new Date().toUTCString()} · ${activeItems.length} items · Offline Read-Only Archive</p>
    </header>
    <main>
      ${cardsHtml || '<p>No items exported.</p>'}
    </main>
  </div>
</body>
</html>`;
}
