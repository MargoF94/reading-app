// The in-app EPUB reader: display settings, the styles they put into the book,
// the messages exchanged with the reader frame, and how reading updates progress.
import { activeReading } from './reading';
import type { Item, Reading, StoredFile } from './types';
import { newId } from './util';

export type ReaderTheme = 'white' | 'light' | 'sepia' | 'dark';
/** literata: bundled, close to Kindle's Bookerly; custom: a font file loaded on this device. */
export type ReaderFont = 'literata' | 'serif' | 'sans' | 'book' | 'custom';
export type ReaderLayout = 'pages' | 'scroll';
/** Japanese books only: keep the book's direction, or force one. */
export type ReaderWriting = 'book' | 'vertical' | 'horizontal';

/** What the bottom-left corner shows; tap it to switch, like on a Kindle. */
export type ReaderFooter = 'location' | 'page' | 'chapter-time' | 'book-time' | 'off';
export const FOOTER_ORDER: ReaderFooter[] = ['location', 'page', 'chapter-time', 'book-time', 'off'];

export interface ReaderPrefs {
  fontSize: number; // percent of the book's own size
  lineHeight: number; // e.g. 1.6
  margin: number; // side margins, percent of the screen width
  theme: ReaderTheme;
  font: ReaderFont;
  layout: ReaderLayout;
  writing: ReaderWriting;
  footer: ReaderFooter;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 100,
  lineHeight: 1.5,
  margin: 4,
  theme: 'white',
  font: 'literata',
  layout: 'pages',
  writing: 'book',
  footer: 'location',
};

export const PREF_LIMITS = {
  fontSize: { min: 50, max: 220, step: 5 },
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
    theme: pick(p.theme, ['white', 'light', 'sepia', 'dark'] as const, DEFAULT_PREFS.theme),
    font: pick(p.font, ['literata', 'serif', 'sans', 'book', 'custom'] as const, DEFAULT_PREFS.font),
    layout: pick(p.layout, ['pages', 'scroll'] as const, DEFAULT_PREFS.layout),
    writing: pick(p.writing, ['book', 'vertical', 'horizontal'] as const, DEFAULT_PREFS.writing),
    footer: pick(p.footer, FOOTER_ORDER, DEFAULT_PREFS.footer),
  };
}

export const THEME_COLORS: Record<ReaderTheme, { bg: string; fg: string; link: string; dark: boolean }> = {
  white: { bg: '#ffffff', fg: '#111111', link: '#1a4f8b', dark: false },
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

/** Families for the bundled and loaded fonts; Japanese falls back to a Japanese serif. */
export const LITERATA = 'Literata';
export const CUSTOM_FONT = 'ReaderCustomFont';

/**
 * Styles placed inside the book's pages. The reader's choices override the book's own.
 * `fontFaces` holds @font-face rules for the bundled or loaded font (with absolute URLs).
 */
export function readerCss(prefs: ReaderPrefs, lang?: string, fontFaces = ''): string {
  const c = THEME_COLORS[prefs.theme];
  const ja = isJapanese(lang);
  const cjk = ja || /^(zh|ko)\b/i.test(lang ?? '');
  const lines = [
    '@namespace epub "http://www.idpf.org/2007/ops";',
    // The page colour comes from the reader behind the book, so it changes with the theme at once.
    // No dark colour-scheme: it would give the page an opaque dark backdrop of its own.
    `html { color: ${c.fg} !important; background: transparent !important; font-size: ${prefs.fontSize}% !important; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }`,
    'body, body *:not(a) { color: inherit !important; background-color: transparent !important; }',
    'body { background-image: none !important; }',
    `a:link, a:visited { color: ${c.link} !important; }`,
    `body, p, li, blockquote, dd, div { line-height: ${prefs.lineHeight} !important; }`,
    'pre { white-space: pre-wrap !important; }',
    'aside[epub|type~="endnote"], aside[epub|type~="footnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }',
  ];
  if (!cjk) lines.push('p, li, blockquote, dd { text-align: justify; hyphens: auto; -webkit-hyphens: auto; widows: 2; orphans: 2; }');
  if (prefs.font !== 'book') {
    const own = prefs.font === 'literata' ? LITERATA : prefs.font === 'custom' ? CUSTOM_FONT : undefined;
    const base = FONTS[prefs.font === 'sans' ? 'sans' : 'serif'][ja ? 'ja' : 'latin'];
    const family = own ? `'${own}', ${base}` : base;
    if (fontFaces) lines.splice(1, 0, fontFaces); // after @namespace, which must come first
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
  | { type: 'clear-search' }
  | { type: 'deselect' }
  /** A font file loaded on this device (null = none). */
  | { type: 'font'; file: Blob | null }
  /** Saved quotes in this book, underlined on the page. */
  | { type: 'annotations'; cfis: string[] }
  | { type: 'bookmarks'; cfis: string[] };

export type FromFrame =
  | { type: 'ready' }
  | { type: 'opened'; title: string; language?: string; toc: TocEntry[]; rtl: boolean }
  | {
      type: 'relocate';
      /** You turned the page or jumped (not the first page shown, nor a re-layout). */
      moved: boolean;
      fraction: number;
      cfi: string;
      chapter?: string;
      chapterHref?: string;
      page?: number;
      pages?: number;
      /** Start of the page, used for a bookmark. */
      pageCfi?: string;
      excerpt?: string;
      /** The bookmark (its cfi) on this page, if any. */
      bookmark?: string;
      /** Location numbers through the whole book (like a Kindle's). */
      location?: { current: number; total: number };
    }
  /** An underlined quote was tapped. */
  | { type: 'annotation'; cfi: string }
  | { type: 'tap' }
  | { type: 'key'; key: string }
  | { type: 'search-hits'; hits: SearchHit[] }
  | { type: 'search-done'; total: number }
  /** Text selected in the book (empty when the selection goes away). */
  | { type: 'selection'; text: string; cfi?: string; sentence?: string }
  | { type: 'error'; message: string };

// ---- selected text ----

const SENTENCE_END = /[.!?…。！？]/;

/**
 * The sentence in `text` around characters start–end (the selection), for a word's note.
 * Long sentences are cut to about `max` characters around the selection.
 */
export function sentenceAt(text: string, start: number, end: number, max = 240): string {
  let a = start;
  while (a > 0 && !(SENTENCE_END.test(text[a - 1]) && (/\s/.test(text[a] ?? ' ') || /[。！？]/.test(text[a - 1])))) a--;
  let b = end;
  while (b < text.length && !SENTENCE_END.test(text[b])) b++;
  while (b < text.length && /[.!?…。！？”’"'」』)]/.test(text[b])) b++;
  let out = text.slice(a, b).replace(/\s+/g, ' ').trim();
  if (out.length > max) {
    const mid = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const i = out.indexOf(mid);
    const from = Math.max(0, i - Math.floor((max - mid.length) / 2));
    out = (from > 0 ? '…' : '') + out.slice(from, from + max).trim() + (from + max < out.length ? '…' : '');
  }
  return out;
}

/** A selection trimmed of surrounding punctuation, as a word to look up; undefined when it's longer than a few words. */
export function selectedWord(text: string): string | undefined {
  const w = text.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
  if (!w || /\n/.test(w)) return undefined;
  const spaced = w.split(/\s+/).length;
  return spaced <= 3 && w.length <= 40 ? w : undefined;
}

/** "Chapter 4 · 53%": where a quote is, for its location. */
export function quoteLocation(chapter: string | undefined, fraction: number): string {
  return [chapter, `${percentOf(fraction)}%`].filter(Boolean).join(' · ');
}

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
