// Book details from free online sources. All calls run in the browser, so each
// source must allow cross-site requests. Failures are silent: sources are optional.
import type { ItemDraft } from './drafts';
import { htmlToMarkdown } from './html';
import { parseIsbn } from './isbn';
import { normalize } from './util';

const TIMEOUT_MS = 8000;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) throw new QuotaError();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export class QuotaError extends Error {
  constructor() {
    super('Daily lookup limit reached for this source.');
  }
}

type Obj = Record<string, any>;

/** "2004", "March 2004", "Mar 01, 2004", "2004-03-01", "20040301" → YYYY[-MM[-DD]] */
export function normalizePubDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const s = String(value).trim();
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s;
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})?$/);
  if (compact) return compact[3] ? `${compact[1]}-${compact[2]}-${compact[3]}` : `${compact[1]}-${compact[2]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /\d{1,2}.*\d{4}|\d{4}.*\d{1,2}/.test(s) && /[a-z]/i.test(s)) {
    const d = new Date(t);
    const hasDay = /\b\d{1,2}\b/.test(s.replace(/\d{4}/, ''));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return hasDay ? `${y}-${m}-${String(d.getDate()).padStart(2, '0')}` : `${y}-${m}`;
  }
  return s.match(/\b(\d{4})\b/)?.[1];
}

// ---- Open Library -----------------------------------------------------------

const OL_LANG: Record<string, string> = {
  eng: 'en',
  rus: 'ru',
  jpn: 'ja',
  ger: 'de',
  fre: 'fr',
  spa: 'es',
  ita: 'it',
  chi: 'zh',
  kor: 'ko',
  ukr: 'uk',
  pol: 'pl',
  por: 'pt',
  dut: 'nl',
  swe: 'sv',
};

function olDraft(v: Obj, isbn: string): ItemDraft {
  const ids = parseIsbn(v.identifiers?.isbn_13?.[0] ?? v.identifiers?.isbn_10?.[0] ?? isbn);
  return {
    type: 'book',
    source: 'Open Library',
    title: v.title,
    authors: (v.authors ?? []).map((a: Obj) => a.name).filter(Boolean),
    coverUrl: v.cover?.large ?? v.cover?.medium,
    book: {
      ...(ids ?? {}),
      pageCount: v.number_of_pages || undefined,
      publisher: v.publishers?.[0]?.name,
      publicationDate: normalizePubDate(v.publish_date),
    },
  };
}

/** Up to ~40 ISBNs per call. Returns drafts keyed by the ISBN asked for. */
export async function openLibraryByIsbns(isbns: string[], signal?: AbortSignal): Promise<Map<string, ItemDraft>> {
  const keys = isbns.map((i) => `ISBN:${i}`).join(',');
  const data = (await getJson(
    `https://openlibrary.org/api/books?bibkeys=${keys}&format=json&jscmd=data`,
    signal,
  )) as Record<string, Obj>;
  const out = new Map<string, ItemDraft>();
  for (const [key, v] of Object.entries(data ?? {})) out.set(key.replace(/^ISBN:/, ''), olDraft(v, key.slice(5)));
  return out;
}

async function openLibrarySearch(query: string, signal?: AbortSignal): Promise<ItemDraft[]> {
  const fields = 'key,title,author_name,first_publish_year,isbn,cover_i,publisher,number_of_pages_median,language';
  const data = (await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8&fields=${fields}`,
    signal,
  )) as Obj;
  return (data?.docs ?? []).map((d: Obj): ItemDraft => {
    const isbn13 = (d.isbn ?? []).map((i: string) => parseIsbn(i)).find((x: unknown) => x);
    return {
      type: 'book',
      source: 'Open Library',
      title: d.title,
      authors: d.author_name ?? [],
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
      language: OL_LANG[d.language?.[0]],
      book: {
        ...(isbn13 ?? {}),
        pageCount: d.number_of_pages_median || undefined,
        publisher: d.publisher?.[0],
        publicationDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
      },
    };
  });
}

// ---- Google Books -------------------------------------------------------------

function googleDraft(v: Obj): ItemDraft {
  const info = v.volumeInfo ?? {};
  const ids: Obj[] = info.industryIdentifiers ?? [];
  const isbn = parseIsbn(ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier ?? '');
  const thumb: string | undefined = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
  return {
    type: 'book',
    source: 'Google Books',
    title: info.title,
    authors: info.authors ?? [],
    description: info.description ? htmlToMarkdown(info.description) : undefined,
    coverUrl: thumb?.replace(/^http:/, 'https:').replace(/&edge=curl/, ''),
    language: typeof info.language === 'string' ? info.language.slice(0, 2) : undefined,
    book: {
      ...(isbn ?? {}),
      pageCount: info.pageCount || undefined,
      publisher: info.publisher,
      publicationDate: normalizePubDate(info.publishedDate),
    },
  };
}

async function googleBooks(query: string, key: string | undefined, max: number, signal?: AbortSignal) {
  const url =
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${max}&printType=books` +
    (key ? `&key=${encodeURIComponent(key)}` : '');
  const data = (await getJson(url, signal)) as Obj;
  return (data?.items ?? []).map(googleDraft) as ItemDraft[];
}

// ---- openBD (Japanese books; best effort, the service has been scaled back) ----

async function openBd(isbn: string, signal?: AbortSignal): Promise<ItemDraft | undefined> {
  const data = (await getJson(`https://api.openbd.jp/v1/get?isbn=${isbn}`, signal)) as (Obj | null)[];
  const s = data?.[0]?.summary;
  if (!s?.title) return undefined;
  const authors = String(s.author ?? '')
    .split(/\s+/)
    .filter((a) => /／?(著|作|文|原作)$/.test(a) || !/／/.test(a))
    .map((a) => a.replace(/／.*$/, '').replace(/,/g, ''))
    .filter(Boolean);
  return {
    type: 'book',
    source: 'openBD',
    title: [s.title, s.volume].filter(Boolean).join(' '),
    authors,
    coverUrl: s.cover || undefined,
    language: 'ja',
    series: s.series || undefined,
    book: { ...(parseIsbn(isbn) ?? {}), publisher: s.publisher || undefined, publicationDate: normalizePubDate(s.pubdate) },
  };
}

// ---- merging --------------------------------------------------------------------

const rec = (o: object) => o as Record<string, unknown>;
const empty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Merges drafts; earlier drafts win, later ones fill the gaps. */
export function mergeDrafts(drafts: (ItemDraft | undefined)[]): ItemDraft | undefined {
  const list = drafts.filter((d): d is ItemDraft => !!d && !!d.title);
  if (!list.length) return undefined;
  const out: ItemDraft = { type: 'book', book: {} };
  for (const d of list) {
    for (const [k, v] of Object.entries(d)) {
      if (k !== 'book' && !empty(v) && empty(rec(out)[k])) rec(out)[k] = v;
    }
    for (const [k, v] of Object.entries(d.book ?? {})) {
      if (!empty(v) && empty(rec(out.book!)[k])) rec(out.book!)[k] = v;
    }
  }
  out.source = [...new Set(list.map((d) => d.source))].join(' + ');
  return out;
}

export interface LookupOptions {
  googleKey?: string;
  signal?: AbortSignal;
}

/** Everything the free sources know about one ISBN, merged. */
export async function lookupIsbn(isbn13: string, opts: LookupOptions = {}): Promise<ItemDraft | undefined> {
  const japanese = isbn13.startsWith('9784');
  const [google, ol, bd] = await Promise.allSettled([
    googleBooks(`isbn:${isbn13}`, opts.googleKey, 1, opts.signal).then((r) => r[0]),
    openLibraryByIsbns([isbn13], opts.signal).then((m) => m.get(isbn13)),
    japanese ? openBd(isbn13, opts.signal) : Promise.resolve(undefined),
  ]);
  const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : undefined);
  const order = japanese ? [val(bd), val(google), val(ol)] : [val(google), val(ol)];
  const merged = mergeDrafts(order);
  if (!merged) return undefined;
  // Prefer the larger Open Library / openBD covers over Google's thumbnails.
  merged.coverUrl = val(ol)?.coverUrl ?? val(bd)?.coverUrl ?? merged.coverUrl;
  merged.book = { ...merged.book, ...parseIsbn(isbn13) };
  return merged;
}

/** Free-text search (title, author). Returns candidates to choose from. */
export async function searchBooks(query: string, opts: LookupOptions = {}): Promise<ItemDraft[]> {
  const [google, ol] = await Promise.allSettled([
    googleBooks(query, opts.googleKey, 8, opts.signal),
    openLibrarySearch(query, opts.signal),
  ]);
  const all = [
    ...(google.status === 'fulfilled' ? google.value : []),
    ...(ol.status === 'fulfilled' ? ol.value : []),
  ];
  if (!all.length && google.status === 'rejected' && ol.status === 'rejected') {
    throw google.reason instanceof QuotaError ? google.reason : new Error('Couldn’t reach the book databases. Check your connection.');
  }
  const seen = new Set<string>();
  return all.filter((d) => {
    const key = d.book?.isbn13 ?? normalize(`${d.title}|${d.authors?.[0] ?? ''}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "https://www.goodreads.com/book/show/12345-the-name-of-the-wind" → "the name of the wind" */
export function goodreadsSlugQuery(url: string): string | undefined {
  const m = url.match(/goodreads\.com\/(?:[a-z]+\/)?book\/show\/\d+[.-]([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).replace(/[._-]+/g, ' ').trim() : undefined;
}
