import { SectionTheme, VaultCollection, VaultTag } from '../types/vault';

export const GRAIN_SVG_DATA_URI = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E")`;

export const SECTIONS: SectionTheme[] = [
  {
    index: 0,
    id: 'link',
    name: 'LINKS',
    ghostText: 'LINKS',
    openCta: 'OPEN LINKS',
    countLabel: 'saved links',
    singularLabel: 'Website Link',
    bg: '#F4845F',
    panel: '#F79B7F',
    image: './hero/links.png',
  },
  {
    index: 1,
    id: 'github',
    name: 'GITHUB',
    ghostText: 'REPOS',
    openCta: 'OPEN REPOS',
    countLabel: 'saved repos',
    singularLabel: 'GitHub Repo',
    bg: '#6BBF7A',
    panel: '#85CC92',
    image: './hero/github.png',
  },
  {
    index: 2,
    id: 'note',
    name: 'NOTES',
    ghostText: 'NOTES',
    openCta: 'OPEN NOTES',
    countLabel: 'saved notes',
    singularLabel: 'Markdown Note',
    bg: '#E882B4',
    panel: '#ED9DC4',
    image: './hero/notes.png',
  },
  {
    index: 3,
    id: 'hackathon',
    name: 'HACKATHONS',
    ghostText: 'HACKS',
    openCta: 'OPEN HACKS',
    countLabel: 'saved hackathons',
    singularLabel: 'Hackathon',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
    image: './hero/hackathons.png',
  },
];

export const SECTION_BY_TYPE: Record<string, SectionTheme> = {
  link: SECTIONS[0],
  github: SECTIONS[1],
  note: SECTIONS[2],
  hackathon: SECTIONS[3],
};

export const DEFAULT_COLLECTIONS: VaultCollection[] = [
  { id: 'col-general', name: 'General', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'col-dev', name: 'Development', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'col-design', name: 'Design', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'col-research', name: 'Research', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'col-shipping', name: 'Hackathons', createdAt: '2026-01-01T00:00:00.000Z' },
];

export const DEFAULT_TAGS: VaultTag[] = [
  { id: 'tag-web', name: 'web', color: '#F4845F' },
  { id: 'tag-code', name: 'open-source', color: '#6BBF7A' },
  { id: 'tag-security', name: 'security', color: '#6EB5FF' },
  { id: 'tag-ui', name: 'design', color: '#E882B4' },
  { id: 'tag-docs', name: 'reference', color: '#F59E0B' },
  { id: 'tag-sprint', name: 'hackathon', color: '#A855F7' },
];
