// An item can be in several series. Its main series stays in seriesId/seriesNumber
// (what older versions of the app know, shown on covers and used for sorting); any
// others are in moreSeries. Read and write them through these helpers.
import type { Item, SeriesEntry } from './types';
import { plural } from './util';

type InSeries = Pick<Item, 'seriesId' | 'seriesNumber' | 'moreSeries'>;

/** Every series the item is in, the main one first. */
export function seriesOf(item: InSeries): SeriesEntry[] {
  const out: SeriesEntry[] = [];
  if (item.seriesId) out.push({ id: item.seriesId, number: item.seriesNumber });
  for (const s of item.moreSeries ?? []) if (s?.id && !out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

export function inSeries(item: InSeries, seriesId: string): boolean {
  return seriesOf(item).some((s) => s.id === seriesId);
}

/** The item's number in one of its series ("2", "1.5"…), if it has one there. */
export function numberIn(item: InSeries, seriesId: string): string | undefined {
  return seriesOf(item).find((s) => s.id === seriesId)?.number;
}

/** The fields that put an item in these series, the first being its main one. Repeats and blanks are dropped. */
export function seriesFields(list: SeriesEntry[]): {
  seriesId: string | undefined;
  seriesNumber: string | undefined;
  moreSeries: SeriesEntry[] | undefined;
} {
  const seen = new Set<string>();
  const clean: SeriesEntry[] = [];
  for (const s of list) {
    if (!s.id || seen.has(s.id)) continue;
    seen.add(s.id);
    const number = s.number?.trim() || undefined;
    clean.push(number ? { id: s.id, number } : { id: s.id });
  }
  const [main, ...more] = clean;
  return { seriesId: main?.id, seriesNumber: main?.number, moreSeries: more.length ? more : undefined };
}

/** The item taken out of a series (e.g. one being deleted); its next series becomes the main one. */
export function withoutSeries<T extends InSeries>(item: T, seriesId: string): T {
  return { ...item, ...seriesFields(seriesOf(item).filter((s) => s.id !== seriesId)) };
}

// ---- length of a series -------------------------------------------------------------

export interface SeriesLength {
  /** Pages of the books and manga that have a page count, added up. */
  pages: number;
  /** Books and manga with a page count, by type. */
  pagedBooks: number;
  pagedManga: number;
  /** Books and manga without one (not in `pages`). */
  noPages: number;
  /** Words of the fics that have a word count, added up. */
  words: number;
  countedFics: number;
  /** Fics without a word count (not in `words`). */
  noWords: number;
}

/** Total pages of a series' books and manga, and total words of its fics. */
export function seriesLength(items: Item[]): SeriesLength {
  const out: SeriesLength = { pages: 0, pagedBooks: 0, pagedManga: 0, noPages: 0, words: 0, countedFics: 0, noWords: 0 };
  for (const item of items) {
    if (item.type === 'fic') {
      if (item.wordCount && item.wordCount > 0) {
        out.words += item.wordCount;
        out.countedFics++;
      } else out.noWords++;
    } else {
      const pages = item.book?.pageCount;
      if (pages && pages > 0) {
        out.pages += pages;
        if (item.type === 'manga') out.pagedManga++;
        else out.pagedBooks++;
      } else out.noPages++;
    }
  }
  return out;
}

/** Short form for lists: "1,204 pages · 98,000 words" (only what's known). */
export function lengthSummary(l: SeriesLength): string {
  const parts: string[] = [];
  if (l.pagedBooks + l.pagedManga) parts.push(plural(l.pages, 'page'));
  if (l.countedFics) parts.push(plural(l.words, 'word'));
  return parts.join(' · ');
}
