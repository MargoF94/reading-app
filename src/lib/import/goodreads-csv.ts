// Goodreads "Export library" CSV → library records.
// Parsing is pure; planGoodreadsImport() returns new/updated records without writing anything.
import { csvObjects } from '../csv';
import { htmlToMarkdown } from '../html';
import { parseIsbn } from '../isbn';
import { newReading } from '../reading';
import type {
  Author,
  BookFormat,
  Collections,
  Item,
  NamedRecord,
  Reading,
  ReadingOutcome,
  Series,
  Status,
} from '../types';
import { newId, normalize } from '../util';

export interface GoodreadsBook {
  goodreadsId: string;
  title: string;
  titleReading?: string;
  series?: string;
  seriesNumber?: string;
  author: string;
  authorAltName?: string;
  additionalAuthors: string[];
  isbn13?: string;
  isbn10?: string;
  rating?: number;
  publisher?: string;
  format?: BookFormat;
  pageCount?: number;
  year?: string;
  originalYear?: number;
  dateRead?: string;
  dateAdded?: string;
  exclusiveShelf: string;
  shelves: string[]; // custom, non-exclusive shelves
  review?: string; // raw Goodreads HTML
  spoiler: boolean;
  notes?: string;
  readCount: number;
  language: string; // best guess
}

export interface GoodreadsParseResult {
  books: GoodreadsBook[];
  exclusiveShelves: { name: string; count: number }[];
  tagShelves: { name: string; count: number }[];
}

const BUILT_IN_SHELVES = ['read', 'to-read', 'currently-reading'];

// ---- field helpers -------------------------------------------------------

const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Goodreads wraps ISBNs as ="0123456789". */
const cleanIsbnField = (s: string) => s.replace(/^="?|"$/g, '').trim();

/** 2024/05/31 → 2024-05-31 */
function gDate(s: string): string | undefined {
  const m = s.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : undefined;
}

const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]*$/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

function scriptOf(s: string): 'latin' | 'cyrillic' | 'japanese' | 'other' {
  if (JAPANESE.test(s)) return 'japanese';
  if (CYRILLIC.test(s)) return 'cyrillic';
  return LATIN.test(s) ? 'latin' : 'other';
}

export function mapBinding(binding: string): BookFormat | undefined {
  const b = binding.toLowerCase();
  if (!b || b.includes('unknown')) return undefined;
  if (/audio|audible|mp3|cd\b/.test(b)) return 'audiobook';
  if (/kindle|ebook|e-book|nook|digital/.test(b)) return 'ebook';
  if (/manga|comic/.test(b)) return 'manga';
  if (/hardcover|hardback|library binding|board book/.test(b)) return 'hardcover';
  if (/paperback|bunko|softcover|mass market|pocket/.test(b)) return 'paperback';
  return 'other';
}

const EDITION_LANG: Record<string, string> = {
  japanese: 'ja',
  russian: 'ru',
  english: 'en',
};

/**
 * Splits a Goodreads title such as
 *   "The Name of the Wind (The Kingkiller Chronicle, #1)"
 *   "屍鬼 1 [Shiki]"
 *   "吸血鬼ハンター（2） (Japanese Edition)"
 * into title, series, number, romanised reading and edition language.
 */
export function parseGoodreadsTitle(raw: string): {
  title: string;
  series?: string;
  seriesNumber?: string;
  titleReading?: string;
  editionLanguage?: string;
} {
  let title = raw.replace(/\s+/g, ' ').trim();
  let series: string | undefined;
  let seriesNumber: string | undefined;
  let titleReading: string | undefined;
  let editionLanguage: string | undefined;

  const stripEdition = () => {
    const m = title.match(/\s*\((\p{L}+) Edition\)\s*$/u);
    if (m && EDITION_LANG[m[1].toLowerCase()]) {
      editionLanguage = EDITION_LANG[m[1].toLowerCase()];
      title = title.slice(0, m.index).trim();
    }
  };

  stripEdition();
  const paren = title.match(/\s*\(([^()]+)\)\s*$/);
  if (paren) {
    const first = paren[1].split(';')[0].trim();
    const m =
      first.match(/^(.+?),?\s*#\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)$/) ??
      first.match(/^(.+?),?\s+(?:Book|Vol\.?|Volume|Part)\s+(\d+(?:\.\d+)?)$/i) ??
      first.match(/^(.+?),\s*(\d+(?:\.\d+)?)$/);
    if (m) {
      series = m[1].trim();
      seriesNumber = m[2].replace(/\s+/g, '');
      title = title.slice(0, paren.index).trim();
    }
  }
  stripEdition();

  // Japanese imprint labels such as (文春文庫) or (GCノベルズ) are not part of the title.
  const imprint = title.match(/\s*[(（]([^()（）]*(?:文庫|ノベルズ|ノベルス|新書|単行本|コミックス|ブックス|文芸)[^()（）]*)[)）]\s*$/);
  if (imprint && scriptOf(title.slice(0, imprint.index)) !== 'latin') title = title.slice(0, imprint.index).trim();

  // "Some Light Novel Series, Vol. 8"
  if (!series) {
    const vol = title.match(/^(.+?),?\s+Vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)$/i);
    if (vol) {
      series = vol[1].replace(/\s*(\((light novels?|manga)\)|light novels?|manga)$/i, '').trim();
      seriesNumber = vol[2];
    }
  }

  const bracket = title.match(/\s*\[([^\]]+)\]\s*$/);
  if (bracket && scriptOf(title.slice(0, bracket.index)) !== 'latin' && scriptOf(bracket[1]) === 'latin') {
    titleReading = bracket[1].trim();
    title = title.slice(0, bracket.index).trim();
  }
  return { title: title || raw.trim(), series, seriesNumber, titleReading, editionLanguage };
}

function guessLanguage(title: string, publisher: string, editionLanguage?: string): string {
  const t = scriptOf(title);
  if (t === 'japanese') return 'ja';
  if (t === 'cyrillic') return 'ru';
  if (editionLanguage) return editionLanguage;
  const p = scriptOf(publisher);
  if (p === 'japanese') return 'ja';
  if (p === 'cyrillic') return 'ru';
  return 'en';
}

// ---- parsing ---------------------------------------------------------------

export function parseGoodreadsCsv(text: string): GoodreadsParseResult {
  const rows = csvObjects(text);
  if (rows.length && !('Book Id' in rows[0] && 'Exclusive Shelf' in rows[0])) {
    throw new Error('This doesn’t look like a Goodreads library export (missing “Book Id” / “Exclusive Shelf” columns).');
  }
  const exclusive = new Map<string, number>();
  for (const r of rows) {
    const s = (r['Exclusive Shelf'] || 'to-read').trim();
    exclusive.set(s, (exclusive.get(s) ?? 0) + 1);
  }
  const exclusiveNames = new Set([...BUILT_IN_SHELVES, ...exclusive.keys()]);
  const tagCounts = new Map<string, number>();

  // Goodreads often lists the author's name in another script as an "additional
  // author" (Hideyuki Kikuchi / 菊地秀行). Illustrators appear there too, so pick
  // the non-Latin name that accompanies a Latin-script author most often.
  const altCounts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const author = cleanName(r['Author'] ?? '');
    if (scriptOf(author) !== 'latin') continue;
    for (const a of splitAuthors(r['Additional Authors'] ?? '')) {
      if (scriptOf(a) === 'latin') continue;
      const m = altCounts.get(author) ?? new Map<string, number>();
      m.set(a, (m.get(a) ?? 0) + 1);
      altCounts.set(author, m);
    }
  }
  const altNameOf = new Map<string, string>();
  for (const [author, m] of altCounts) {
    altNameOf.set(author, [...m].sort((x, y) => y[1] - x[1])[0][0]);
  }

  const books = rows.map((r): GoodreadsBook => {
    const t = parseGoodreadsTitle(r['Title'] ?? '');
    const author = cleanName(r['Author'] ?? '');
    let additional = splitAuthors(r['Additional Authors'] ?? '').filter((a) => normalize(a) !== normalize(author));
    const alt = altNameOf.get(author);
    const authorAltName = alt && additional.includes(alt) ? alt : undefined;
    if (authorAltName) additional = additional.filter((a) => a !== authorAltName);

    const isbn = parseIsbn(cleanIsbnField(r['ISBN13'] ?? '')) ?? parseIsbn(cleanIsbnField(r['ISBN'] ?? ''));
    const rating = parseFloat(r['My Rating'] ?? '');
    const pages = parseInt(r['Number of Pages'] ?? '', 10);
    const format = mapBinding(r['Binding'] ?? '');
    const exclusiveShelf = (r['Exclusive Shelf'] || 'to-read').trim();
    const shelves = (r['Bookshelves'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !exclusiveNames.has(s));
    for (const s of shelves) tagCounts.set(s, (tagCounts.get(s) ?? 0) + 1);
    const publisher = cleanName(r['Publisher'] ?? '');
    const origYear = parseInt(r['Original Publication Year'] ?? '', 10);

    return {
      goodreadsId: (r['Book Id'] ?? '').trim(),
      title: t.title,
      titleReading: t.titleReading,
      series: t.series,
      seriesNumber: t.seriesNumber,
      author,
      authorAltName,
      additionalAuthors: additional,
      isbn13: isbn?.isbn13,
      isbn10: isbn?.isbn10,
      rating: rating > 0 ? Math.min(5, Math.round(rating * 2) / 2) : undefined,
      publisher: publisher || undefined,
      format,
      pageCount: pages > 0 && format !== 'audiobook' ? pages : undefined,
      year: /^\d{4}$/.test((r['Year Published'] ?? '').trim()) ? r['Year Published'].trim() : undefined,
      originalYear: origYear > 0 ? origYear : undefined,
      dateRead: gDate(r['Date Read'] ?? ''),
      dateAdded: gDate(r['Date Added'] ?? ''),
      exclusiveShelf,
      shelves,
      review: (r['My Review'] ?? '').trim() || undefined,
      spoiler: (r['Spoiler'] ?? '').trim().toLowerCase() === 'true',
      notes: (r['Private Notes'] ?? '').trim() || undefined,
      readCount: Math.max(0, parseInt(r['Read Count'] ?? '0', 10) || 0),
      language: guessLanguage(r['Title'] ?? '', publisher, t.editionLanguage),
    };
  });

  detectUnnumberedSeries(books);

  const sorted = (m: Map<string, number>) =>
    [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { books, exclusiveShelves: sorted(exclusive), tagShelves: sorted(tagCounts) };
}

function splitAuthors(field: string): string[] {
  return field.split(',').map(cleanName).filter(Boolean);
}

const SERIES_WORDS = /\b(saga|series|universe|chronicles?|trilogy|duology|cycle|sequence|quartet)\b/i;

/**
 * Second pass over titles:
 * - "Psycho (Necessary Evils)" + "Unhinged (Necessary Evils)" → series without a number
 * - "屍鬼 1" … "屍鬼 5" → series 屍鬼, numbers 1–5 (non-Latin titles only)
 */
function detectUnnumberedSeries(books: GoodreadsBook[]): void {
  const parenOf = (t: string) => t.match(/\s*\(([^()]+)\)\s*$/);
  const known = new Set(books.map((b) => b.series && normalize(b.series)).filter(Boolean));
  const parenCounts = new Map<string, number>();
  const prefixCounts = new Map<string, number>();
  const numbered = (t: string) => t.match(/^(.+?)\s*(\d+)$/);
  for (const b of books) {
    if (b.series) continue;
    const p = parenOf(b.title);
    if (p) parenCounts.set(normalize(p[1]), (parenCounts.get(normalize(p[1])) ?? 0) + 1);
    const n = numbered(b.title);
    if (n && scriptOf(n[1]) !== 'latin') prefixCounts.set(n[1].trim(), (prefixCounts.get(n[1].trim()) ?? 0) + 1);
  }
  for (const b of books) {
    if (b.series) continue;
    const p = parenOf(b.title);
    if (p) {
      const key = normalize(p[1]);
      if (scriptOf(p[1]) === 'latin' && ((parenCounts.get(key) ?? 0) >= 2 || known.has(key) || SERIES_WORDS.test(p[1]))) {
        b.series = p[1].trim();
        b.title = b.title.slice(0, p.index).trim();
        continue;
      }
    }
    const n = numbered(b.title);
    if (n && (prefixCounts.get(n[1].trim()) ?? 0) >= 2) {
      b.series = n[1].trim();
      b.seriesNumber = n[2];
    }
  }
}

/** Default status for an exclusive shelf name. */
export function guessShelfStatus(shelf: string): Status {
  const s = shelf.toLowerCase();
  if (s === 'read') return 'read';
  if (s === 'currently-reading') return 'currently-reading';
  if (s === 'to-read') return 'want-to-read';
  if (/dnf|did-?not-?finish|abandon|gave-?up|unfinished|quit/.test(s)) return 'dnf';
  if (/hold|pause|paused|break/.test(s)) return 'on-hold';
  if (/^read|finished/.test(s)) return 'read';
  if (/reading|current/.test(s)) return 'currently-reading';
  return 'want-to-read';
}

// ---- planning ---------------------------------------------------------------

export interface ImportOptions {
  shelfStatus: Record<string, Status>;
  shelvesAsTags: boolean;
  guessLanguage: boolean;
  additionalAuthors: boolean;
}

export interface ImportPlan {
  records: Pick<Collections, 'items' | 'readings' | 'authors' | 'publishers' | 'series' | 'tags'>;
  added: number;
  duplicates: GoodreadsBook[];
}

function goodreadsIdOf(item: Item): string | undefined {
  return item.book?.goodreadsUrl?.match(/goodreads\.com\/book\/show\/(\d+)/)?.[1];
}

/** Builds the records to add. `existing` is the current library (for matching and duplicates). */
export function planGoodreadsImport(
  books: GoodreadsBook[],
  existing: Collections,
  options: ImportOptions,
  now: string,
): ImportPlan {
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const out: ImportPlan['records'] = { items: [], readings: [], authors: [], publishers: [], series: [], tags: [] };

  // Name → record lookups, seeded with the existing library.
  const authorsByKey = new Map<string, Author>();
  const touchedAuthors = new Map<string, Author>();
  for (const a of live(existing.authors)) {
    for (const n of [a.name, ...(a.altNames ?? [])]) authorsByKey.set(normalize(n), a);
  }
  const named = <T extends NamedRecord>(list: T[]) => new Map(live(list).map((r) => [normalize(r.name), r]));
  const publishers = named(existing.publishers);
  const series = named(existing.series as Series[]);
  const tags = named(existing.tags);

  const stamp = { createdAt: now, updatedAt: now };

  function authorId(name: string, altName?: string): string {
    let a = authorsByKey.get(normalize(name)) ?? (altName ? authorsByKey.get(normalize(altName)) : undefined);
    if (!a) {
      a = { id: newId(), ...stamp, name, altNames: [] };
      authorsByKey.set(normalize(name), a);
      touchedAuthors.set(a.id, a);
    }
    if (altName && normalize(altName) !== normalize(a.name) && !a.altNames.some((n) => normalize(n) === normalize(altName))) {
      a = { ...a, altNames: [...a.altNames, altName] };
      touchedAuthors.set(a.id, a);
    }
    for (const n of [a.name, ...a.altNames]) authorsByKey.set(normalize(n), a);
    return a.id;
  }

  function namedId<T extends NamedRecord>(map: Map<string, T>, bucket: NamedRecord[], name: string): string {
    const key = normalize(name);
    let r = map.get(key);
    if (!r) {
      r = { id: newId(), ...stamp, name } as T;
      map.set(key, r);
      bucket.push(r);
    }
    return r.id;
  }

  // Duplicate detection against the existing library and within the file.
  // Books already in the library are skipped. Within the file only exact Goodreads
  // ids repeat; two entries with the same title are usually different editions.
  const liveItems = live(existing.items).filter((i) => i.type === 'book');
  const seenGr = new Set(liveItems.map(goodreadsIdOf).filter(Boolean));
  const libraryIsbn = new Set(liveItems.map((i) => i.book?.isbn13).filter(Boolean));
  const authorNames = new Map<string, string[]>();
  for (const a of live(existing.authors)) authorNames.set(a.id, [a.name, ...(a.altNames ?? [])].map(normalize));
  const titleKey = (title: string, author: string, n?: string) => `${normalize(title)}|${author}|${n ?? ''}`;
  const libraryTitles = new Set(
    liveItems.flatMap((i) => (authorNames.get(i.authorIds[0]) ?? ['']).map((a) => titleKey(i.title, a, i.seriesNumber))),
  );

  const duplicates: GoodreadsBook[] = [];
  for (const b of books) {
    const inLibrary =
      (b.isbn13 && libraryIsbn.has(b.isbn13)) ||
      libraryTitles.has(titleKey(b.title, normalize(b.author), b.seriesNumber)) ||
      (b.authorAltName && libraryTitles.has(titleKey(b.title, normalize(b.authorAltName), b.seriesNumber)));
    if ((b.goodreadsId && seenGr.has(b.goodreadsId)) || inLibrary) {
      duplicates.push(b);
      continue;
    }
    if (b.goodreadsId) seenGr.add(b.goodreadsId);

    const authorIds = b.author ? [authorId(b.author, b.authorAltName)] : [];
    if (options.additionalAuthors) {
      for (const a of b.additionalAuthors) {
        const id = authorId(a);
        if (!authorIds.includes(id)) authorIds.push(id);
      }
    }

    const createdAt = b.dateAdded ? `${b.dateAdded}T12:00:00.000Z` : now;
    const item: Item = {
      id: newId(),
      createdAt,
      updatedAt: now,
      type: 'book',
      title: b.title,
      titleReading: b.titleReading,
      authorIds,
      language: options.guessLanguage ? b.language : undefined,
      genreIds: [],
      tagIds: options.shelvesAsTags ? b.shelves.map((s) => namedId(tags, out.tags, s)) : [],
      seriesId: b.series ? namedId(series, out.series, b.series) : undefined,
      seriesNumber: b.series ? b.seriesNumber : undefined,
      rating: b.rating,
      review: b.review ? htmlToMarkdown(b.review) : undefined,
      reviewSpoiler: b.review ? b.spoiler : undefined,
      notes: b.notes,
      book: {
        isbn13: b.isbn13,
        isbn10: b.isbn10,
        publisherId: b.publisher ? namedId(publishers, out.publishers, b.publisher) : undefined,
        publicationDate: b.year,
        originalPublicationYear: b.originalYear,
        format: b.format,
        pageCount: b.pageCount,
        goodreadsUrl: b.goodreadsId ? `https://www.goodreads.com/book/show/${b.goodreadsId}` : undefined,
        purchases: [],
      },
    };
    out.items.push(item);
    out.readings.push(...readingsFor(item, b, options.shelfStatus[b.exclusiveShelf] ?? guessShelfStatus(b.exclusiveShelf), now));
  }

  out.authors = [...touchedAuthors.values()];
  return { records: out, added: out.items.length, duplicates };
}

function readingsFor(item: Item, b: GoodreadsBook, status: Status, now: string): Reading[] {
  const make = (outcome: ReadingOutcome, finishDate?: string) =>
    newReading(item, now, { outcome, finishDate, unit: item.book?.format === 'audiobook' ? 'percent' : 'pages' });
  const past = (n: number, outcome: ReadingOutcome) => Array.from({ length: Math.max(0, n) }, () => make(outcome));

  switch (status) {
    case 'want-to-read':
      return [];
    case 'read': {
      const count = Math.max(1, b.readCount);
      return [...past(count - 1, 'finished'), make('finished', b.dateRead)];
    }
    case 'dnf': {
      const count = Math.max(1, b.readCount);
      return [...past(count - 1, 'dnf'), make('dnf', b.dateRead)];
    }
    case 'currently-reading':
    case 'on-hold': {
      // Goodreads counts the current read in "Read Count".
      const active = make(status === 'on-hold' ? 'on-hold' : 'reading');
      return [...past(b.readCount - 1, 'finished'), active];
    }
  }
}
