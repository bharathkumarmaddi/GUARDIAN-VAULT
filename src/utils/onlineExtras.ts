import { VaultItem } from '../types/vault';

export interface GitHubFetchedMeta {
  ownerRepo: string;
  title: string;
  description: string;
  stars: number;
  language: string;
  lastUpdated: string;
  readmePreview?: string;
}

export async function fetchGitHubRepoMeta(
  ownerRepo: string
): Promise<GitHubFetchedMeta | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const clean = ownerRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
  const parts = clean.split('/');
  if (parts.length < 2) return null;
  const pair = `${parts[0]}/${parts[1]}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const res = await fetch(`https://api.github.com/repos/${pair}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();

    let readmePreview = '';
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${pair}/readme`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (readmeRes.ok) {
        const readmeJson = await readmeRes.json();
        if (readmeJson.content) {
          const decoded = atob(readmeJson.content.replace(/\n/g, ''));
          readmePreview = decoded.slice(0, 500);
        }
      }
    } catch {
      // Ignore README error
    }

    return {
      ownerRepo: data.full_name || pair,
      title: data.full_name || pair,
      description: data.description || '',
      stars: typeof data.stargazers_count === 'number' ? data.stargazers_count : 0,
      language: data.language || 'Unknown',
      lastUpdated: data.pushed_at || data.updated_at || new Date().toISOString(),
      readmePreview: readmePreview || undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchStarredReposByUsername(
  username: string
): Promise<Partial<VaultItem>[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You appear to be offline. Connect to the internet to import GitHub stars.');
  }
  const cleanUser = username.trim();
  if (!cleanUser) throw new Error('Enter a valid GitHub username.');

  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(cleanUser)}/starred?per_page=25`,
    {
      headers: { Accept: 'application/vnd.github.v3+json' },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}. Verify the username or rate limits.`);
  }
  const repos = await res.json();
  if (!Array.isArray(repos)) return [];

  return repos.map((r: Record<string, unknown>) => ({
    type: 'github' as const,
    title: String(r.full_name || r.name || 'GitHub Repo'),
    ownerRepo: String(r.full_name || ''),
    url: String(r.html_url || `https://github.com/${r.full_name}`),
    description: r.description ? String(r.description) : '',
    stars: typeof r.stargazers_count === 'number' ? r.stargazers_count : 0,
    language: r.language ? String(r.language) : 'Code',
    lastUpdated: r.updated_at ? String(r.updated_at) : new Date().toISOString(),
    tags: ['starred', ...(r.language ? [String(r.language).toLowerCase()] : [])],
    collectionId: 'col-dev',
  }));
}

export function generateLocalFaviconSvgDataUri(urlOrTitle: string): string {
  let letter = 'W';
  try {
    const u = new URL(/^https?:\/\//i.test(urlOrTitle) ? urlOrTitle : `https://${urlOrTitle}`);
    letter = (u.hostname.replace(/^www\./i, '')[0] || 'W').toUpperCase();
  } catch {
    letter = (urlOrTitle.trim()[0] || 'W').toUpperCase();
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#18181b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="700" font-size="32">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function fetchWebsiteMetadata(url: string): Promise<{
  title?: string;
  favicon: string;
}> {
  const fallbackFavicon = generateLocalFaviconSvgDataUri(url);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { favicon: fallbackFavicon };
  }
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const extractedTitle = titleMatch ? titleMatch[1].trim() : undefined;
      return {
        title: extractedTitle,
        favicon: fallbackFavicon,
      };
    }
  } catch {
    // CORS or offline; gracefully return local monogram icon
  }
  return { favicon: fallbackFavicon };
}

export async function checkLinkReachability(
  item: VaultItem
): Promise<'ok' | 'dead' | 'unknown'> {
  if (!item.url) return 'unknown';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'unknown';

  try {
    if (item.type === 'github' && item.ownerRepo) {
      const res = await fetch(`https://api.github.com/repos/${item.ownerRepo}`, {
        method: 'HEAD',
      });
      return res.status === 404 ? 'dead' : 'ok';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    await fetch(item.url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return 'ok';
  } catch {
    return 'dead';
  }
}
