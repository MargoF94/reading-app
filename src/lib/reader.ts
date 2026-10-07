// The in-app EPUB reader: display settings, the styles they put into the book,
// the messages exchanged with the reader frame, and how reading updates progress.
import { activeReading } from './reading';
import type { Item, Reading, StoredFile } from './types';
import { newId } from './util';

export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'serif' | 'sans' | 'book';
export type ReaderLayout = 'pages' | 'scroll';
/** Japanese books only: keep the book's direction, or force one. */
export type ReaderWriting = 'book' | 'vertical' | 'horizontal';

export interface ReaderPrefs {
  fontSize: number; // percent of the book's own size
  lineHeight: number; // e.g. 1.6
  margin: number; // side margins, percent of the screen width
  theme: ReaderTheme;
  font: ReaderFont;
  layout: ReaderLayout;
  writing: ReaderWriting;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 100,
  lineHeight: 1.6,
  margin: 4,
  theme: 'sepia',
  font: 'serif',
  layout: 'pages',
  writing: 'book',
};

export const PREF_LIMITS = {
  fontSize: { min: 70, max: 220, step: 10 },
  lineHeight: { min: 1, max: 2.6, step: 0.1 },
  margin: { min: 0, max: 20, step: 1 },
} as const;

const clamp = (v: unknown, { min, max }: { min: number; max: number }, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

/** Saved settings, with anything missing or out of range replaced by the default. */
export function cleanPrefs(raw: unknown): ReaderPrefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReaderPrefs, unknown>>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  return {
    fontSize: clamp(p.fontSize, PREF_LIMITS.fontSize, DEFAULT_PREFS.fontSize),
    lineHeight: Math.round(clamp(p.lineHeight, PREF_LIMITS.lineHeight, DEFAULT_PREFS.lineHeight) * 10) / 10,
    margin: clamp(p.margin, PREF_LIMITS.margin, DEFAULT_PREFS.margin),
    theme: pick(p.theme, ['light', 'sepia', 'dark'] as const, DEFAULT_PREFS.theme),
    font: pick(p.font, ['serif', 'sans', 'book'] as const, DEFAULT_PREFS.font),
    layout: pick(p.layout, ['pages', 'scroll'] as const, DEFAULT_PREFS.layout),
    writing: pick(p.writing, ['book', 'vertical', 'horizontal'] as const, DEFAULT_PREFS.writing),
  };
}

export const THEME_COLORS: Record<ReaderTheme, { bg: string; fg: string; link: string; dark: boolean }> = {
  light: { bg: '#fbfbfa', fg: '#1d2227', link: '#3d5467', dark: false },
  sepia: { bg: '#f3ead8', fg: '#3b2f22', link: '#7a4f22', dark: false },
  dark: { bg: '#16191c', fg: '#c9cdd1', link: '#9fb6c9', dark: true },
};

const FONTS: Record<'serif' | 'sans', { latin: string; ja: string }> = {
  serif: {
    latin: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Hiragino Mincho ProN', 'Yu Mincho', serif",
    ja: "'Hiragino Mincho ProN', 'Yu Mincho', YuMincho, 'Noto Serif JP', 'Noto Serif CJK JP', serif",
  },
  sans: {
    latin: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Hiragino Sans', sans-serif",
    ja: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif",
  },
};

export const isJapanese = (lang: string | undefined): boolean => /^ja\b/i.test(lang ?? '');

/** Styles placed inside the book's pages. The reader's choices override the book's own. */
export function readerCss(prefs: ReaderPrefs, lang?: string): string {
  const c = THEME_COLORS[prefs.theme];
  const ja = isJapanese(lang);
  const cjk = ja || /^(zh|ko)\b/i.test(lang ?? '');
  const lines = [
    '@namespace epub "http://www.idpf.org/2007/ops";',
    // The page colour comes from the reader behind the book, so it changes with the theme at once.
    // No dark colour-scheme: it would give the page an opaque dark backdrop of its own.
    `html { color: ${c.fg} !important; background: transparent !important; font-size: ${prefs.fontSize}% !important; }`,
    'body, body *:not(a) { color: inherit !important; background-color: transparent !important; }',
    'body { background-image: none !important; }',
    `a:link, a:visited { color: ${c.link} !important; }`,
    `body, p, li, blockquote, dd, div { line-height: ${prefs.lineHeight} !important; }`,
    'pre { white-space: pre-wrap !important; }',
    'aside[epub|type~="endnote"], aside[epub|type~="footnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }',
  ];
  if (!cjk) lines.push('p, li, blockquote, dd { text-align: justify; hyphens: auto; -webkit-hyphens: auto; widows: 2; orphans: 2; }');
  if (prefs.font !== 'book') {
    const family = FONTS[prefs.font][ja ? 'ja' : 'latin'];
    lines.push(`body, body *:not(code):not(pre):not(kbd):not(samp):not(rt) { font-family: ${family} !important; }`);
  }
  if (ja && prefs.writing !== 'book') {
    const mode = prefs.writing === 'vertical' ? 'vertical-rl' : 'horizontal-tb';
    lines.push(`html, body { writing-mode: ${mode} !important; -webkit-writing-mode: ${mode} !important; }`);
  }
  return lines.join('\n');
}

// ---- messages between the reader page and the frame that shows the book ----

export interface TocEntry {
  label: string;
  href: string;
  depth: number;
  fraction?: number; // where it starts in the book, 0–1
}

export interface SearchHit {
  cfi: string;
  chapter: string;
  pre: string;
  match: string;
  post: string;
}

export type ToFrame =
  | { type: 'open'; file: File; cfi?: string; prefs: ReaderPrefs }
  | { type: 'prefs'; prefs: ReaderPrefs }
  | { type: 'goto'; target: string }
  | { type: 'fraction'; fraction: number }
  | { type: 'turn'; dir: 'left' | 'right' | 'next' | 'prev' }
  | { type: 'search'; query: string }
  | { type: 'clear-search' };

export type FromFrame =
  | { type: 'ready' }
  | { type: 'opened'; title: string; language?: string; toc: TocEntry[]; rtl: boolean }
  | {
      type: 'relocate';
      fraction: number;
      cfi: string;
      chapter?: string;
      chapterHref?: string;
      page?: number;
      pages?: number;
    }
  | { type: 'tap' }
  | { type: 'key'; key: string }
  | { type: 'search-hits'; hits: SearchHit[] }
  | { type: 'search-done'; total: number }
  | { type: 'error'; message: string };

// ---- files and progress ----

export const isEpub = (f: Pick<StoredFile, 'name' | 'type'>): boolean =>
  /\.epub$/i.test(f.name) || f.type === 'application/epub+zip';

/** The EPUB to open from the book page: the one read most recently, else the first. */
export function readableFile(item: Item): StoredFile | undefined {
  const epubs = (item.files ?? []).filter(isEpub);
  return [...epubs].sort((a, b) => (b.position?.at ?? '').localeCompare(a.position?.at ?? ''))[0];
}

export const percentOf = (fraction: number): number =>
  fraction >= 0.995 ? 100 : Math.max(0, Math.min(99, Math.floor(fraction * 100)));

/**
 * The read-through after reading up to `percent` today, or null when nothing changes.
 * Only an active read-through is updated (finished or abandoned books aren't restarted
 * by opening them). Each day keeps one reader entry, updated as pages turn.
 */
export function readerProgress(readings: Reading[], percent: number, date: string, now: string): Reading | null {
  const active = activeReading(readings);
  if (!active) return null;
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const lastEntry = active.log.at(-1);
  // Reopening the book where it was left adds nothing.
  if (lastEntry?.unit === 'percent' && lastEntry.value === value) return null;
  let log = active.log;
  if (lastEntry && lastEntry.date === date && lastEntry.unit === 'percent') {
    log = [...active.log.slice(0, -1), { ...lastEntry, value }];
  } else {
    if (value === 0) return null;
    log = [...active.log, { id: newId(), date, value, unit: 'percent' }];
  }
  return { ...active, outcome: 'reading', log, updatedAt: now };
}
