// Searching, ordering and copying saved quotes.
import type { Quote } from './types';
import { normalize } from './util';

export type QuoteSort = 'added' | 'newest' | 'item';
export const QUOTE_SORTS: QuoteSort[] = ['added', 'newest', 'item'];

/** What a quote is from: the book or fic title and its author(s). */
export interface QuoteSource {
  title: string;
  by?: string;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Quotes matching the search (quote, location, note, or the book's title and
 * authors), in the order asked for. `quotes` must be in the order they were added.
 * "item" groups them by book or fic title, each book's quotes in the order added.
 */
export function filterQuotes(
  quotes: Quote[],
  sourceOf: (itemId: string) => QuoteSource | undefined,
  search: string,
  sort: QuoteSort,
): Quote[] {
  const needle = normalize(search.trim());
  let list = quotes;
  if (needle) {
    list = list.filter((q) => {
      const src = sourceOf(q.itemId);
      const hay = [q.text, q.location, q.note, src?.title, src?.by].filter(Boolean).join('\n');
      return normalize(hay).includes(needle);
    });
  }
  if (sort === 'newest') return [...list].reverse();
  if (sort === 'item') {
    const title = (q: Quote) => sourceOf(q.itemId)?.title ?? '￿';
    // Array sort is stable, so each book keeps the order its quotes were added in.
    return [...list].sort((a, b) => collator.compare(title(a), title(b)) || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  }
  return list;
}

/** The quote as text to paste elsewhere: “…” — Title, Author (p. 42) */
export function quoteText(q: Quote, src: QuoteSource | undefined): string {
  const by = src ? [src.title, src.by].filter(Boolean).join(', ') : '';
  const cite = [by, q.location && `(${q.location})`].filter(Boolean).join(' ');
  return `“${q.text.trim()}”` + (cite ? `\n— ${cite}` : '');
}
