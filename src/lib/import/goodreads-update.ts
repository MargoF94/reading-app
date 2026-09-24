// Bulk update: fills in missing details for books that have a Goodreads link
// (e.g. everything from the Goodreads CSV import) from their Goodreads pages.
//
// The app can't read goodreads.com itself (browsers block it), so a bookmarklet
// clicked on goodreads.com opens this app and fetches pages for it:
//   app → Goodreads tab: { t: 'rl-hello' }              (are you there?)
//   Goodreads tab → app: { t: 'rl-ready' }
//   app → Goodreads tab: { t: 'rl-fetch', id }           (one book at a time)
//   Goodreads tab → app: { t: 'rl-book', id, data | error }
// The app paces the requests, so the Goodreads tab needs no timers of its own
// (browsers slow those down in background tabs).
import type { ItemDraft } from '../drafts';
import type { Item } from '../types';
import { collectGoodreads } from './goodreads-page';

export const GOODREADS_ORIGIN = 'https://www.goodreads.com';

export function goodreadsId(item: Item): string | undefined {
  return item.book?.goodreadsUrl?.match(/goodreads\.com\/(?:[a-z]+\/)?book\/show\/(\d+)/)?.[1];
}

/** Books that can be updated: they have a Goodreads link (and, unless `again`, haven't been updated yet). */
export function updateCandidates(items: Item[], again = false): Item[] {
  return items.filter((i) => i.type === 'book' && !i.deleted && goodreadsId(i) && (again || !i.book?.goodreadsCheckedAt));
}

type NameCollection = 'authors' | 'publishers' | 'series' | 'genres';

/**
 * Applies a Goodreads draft to an existing book the same way the bookmarklet's
 * edit form does: only empty fields are filled; genres are added to the book's own.
 * Returns the updated book and the names of the fields that changed.
 */
export async function fillFromDraft(
  item: Item,
  d: ItemDraft,
  nameId: (collection: NameCollection, name: string) => Promise<string>,
  checkedAt: string,
): Promise<{ item: Item; changed: string[] }> {
  const next: Item = { ...item, book: { purchases: [], ...item.book, goodreadsCheckedAt: checkedAt } };
  const book = next.book!;
  const changed: string[] = [];
  const empty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && !v.length);
  const set = <T>(label: string, current: T, value: T | undefined, apply: (v: T) => void) => {
    if (value !== undefined && value !== '' && empty(current)) {
      apply(value);
      changed.push(label);
    }
  };

  set('original title', next.originalTitle, d.originalTitle, (v) => (next.originalTitle = v));
  set('language', next.language, d.language, (v) => (next.language = v));
  set('description', next.description, d.description, (v) => (next.description = v));
  set('cover', next.coverUrl, d.coverUrl, (v) => (next.coverUrl = v));
  if (d.authors?.length && !next.authorIds.length) {
    next.authorIds = [...new Set(await Promise.all(d.authors.map((a) => nameId('authors', a))))];
    changed.push('authors');
  }
  if (d.series && !next.seriesId) {
    next.seriesId = await nameId('series', d.series);
    next.seriesNumber = d.seriesNumber;
    changed.push('series');
  }
  if (d.genres?.length) {
    const ids = await Promise.all(d.genres.map((g) => nameId('genres', g)));
    const merged = [...new Set([...next.genreIds, ...ids])];
    if (merged.length > next.genreIds.length) {
      next.genreIds = merged;
      changed.push('genres');
    }
  }
  const b = d.book ?? {};
  set('ISBN-13', book.isbn13, b.isbn13, (v) => (book.isbn13 = v));
  set('ISBN-10', book.isbn10, b.isbn10, (v) => (book.isbn10 = v));
  set('publication date', book.publicationDate, b.publicationDate, (v) => (book.publicationDate = v));
  set('original year', book.originalPublicationYear, b.originalPublicationYear, (v) => (book.originalPublicationYear = v));
  set('format', book.format, b.format, (v) => (book.format = v));
  set('pages', book.pageCount, b.pageCount, (v) => (book.pageCount = v));
  if (b.publisher && !book.publisherId) {
    book.publisherId = await nameId('publishers', b.publisher);
    changed.push('publisher');
  }
  return { item: next, changed };
}

/**
 * Runs on goodreads.com inside the bookmarklet (via Function.toString), so it
 * must stay self-contained. `collect` is collectGoodreads, passed in as source.
 */
function serveGoodreads(appUrl: string, collect: typeof collectGoodreads) {
  const w = window as unknown as Record<string, unknown>;
  const appOrigin = new URL(appUrl).origin;
  if (location.origin !== 'https://www.goodreads.com') {
    alert('Open www.goodreads.com first, then click this bookmark again.');
    return;
  }
  const url = appUrl + '#/import/goodreads-update';
  const existing = w.__readingLogApp as Window | undefined;
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }
  const app = window.open(url, 'reading-log-goodreads');
  if (!app) {
    alert('Your browser blocked the Reading Log tab. Allow pop-ups for goodreads.com and try again.');
    return;
  }
  w.__readingLogApp = app;
  if (w.__readingLogListening) return;
  w.__readingLogListening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const target = w.__readingLogApp as Window | undefined;
    if (e.origin !== appOrigin || !target || e.source !== target) return;
    const m = e.data || {};
    if (m.t === 'rl-hello') target.postMessage({ t: 'rl-ready' }, appOrigin);
    if (m.t !== 'rl-fetch' || !/^\d+$/.test(String(m.id))) return;
    const id = String(m.id);
    fetch('/book/show/' + id, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text().then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const data = collect(doc, r.url || 'https://www.goodreads.com/book/show/' + id);
          if (typeof data === 'string') throw new Error(data);
          target.postMessage({ t: 'rl-book', id, data }, appOrigin);
        });
      })
      .catch((err: unknown) => target.postMessage({ t: 'rl-book', id, error: String((err as Error)?.message || err) }, appOrigin));
  });
}

export function goodreadsUpdateBookmarklet(appUrl: string): string {
  const code = `(${serveGoodreads.toString()})(${JSON.stringify(appUrl)},${collectGoodreads.toString()})`;
  return 'javascript:' + encodeURIComponent(code);
}
