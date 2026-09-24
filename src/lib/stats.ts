// Reading statistics. Pure functions over the library data so they can be tested.
import { FORMAT_LABEL, LANGUAGE_NAME } from './constants';
import { convert } from './fx';
import { entryPercent } from './reading';
import type { Collections, Currency, Item, ItemType, Reading, Settings } from './types';
import { collator } from './util';

// ---- periods ------------------------------------------------------------------

export interface Period {
  from?: string; // YYYY-MM-DD inclusive; undefined = no lower bound
  to?: string; // YYYY-MM-DD inclusive; undefined = no upper bound
}

export type PresetId = 'this-year' | 'last-year' | 'last-12' | 'this-month' | 'all';

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'last-12', label: 'Last 12 months' },
  { id: 'this-month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}

export function presetPeriod(id: PresetId, today: string): Period {
  const [y, m] = today.split('-').map(Number);
  switch (id) {
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
    case 'last-12': {
      const start = new Date(Date.UTC(y, m - 12, 1));
      return {
        from: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`,
        to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`,
      };
    }
    case 'all':
      return {};
  }
}

export function inPeriod(date: string | undefined, p: Period): boolean {
  if (!date) return !p.from && !p.to; // undated events only count in "all time"
  return (!p.from || date >= p.from) && (!p.to || date <= p.to.slice(0, 10));
}

// ---- lengths ------------------------------------------------------------------

export interface Length {
  pages?: number;
  words?: number;
  wordsEstimated: boolean;
  minutes?: number;
}

/**
 * Pages, words (or word-equivalents) and listening time of one item.
 * Japanese counts are characters, converted with the characters-per-word setting.
 */
export function itemLength(item: Item, s: Settings): Length {
  const ja = item.language === 'ja';
  if (item.type === 'fic') {
    if (!item.wordCount) return { wordsEstimated: false };
    return { words: ja ? item.wordCount / s.jaCharsPerWord : item.wordCount, wordsEstimated: ja };
  }
  const b = item.book;
  const pages = b?.pageCount || undefined;
  const minutes = b?.format === 'audiobook' ? b.durationMinutes || undefined : undefined;
  const len: Length = { pages, minutes, wordsEstimated: true };
  if (b?.format === 'manga' && !s.mangaCountsWords) return len;
  if (item.wordCount) {
    len.words = ja ? item.wordCount / s.jaCharsPerWord : item.wordCount;
    len.wordsEstimated = !!item.wordCountEstimated || ja;
  } else if (pages) {
    const wpp = s.wordsPerPage[item.language ?? 'en'] ?? s.wordsPerPage.en ?? 275;
    len.words = pages * wpp;
  } else if (minutes) {
    len.words = (minutes / 60) * s.audiobookWordsPerHour;
  }
  return len;
}

// ---- attribution ----------------------------------------------------------------

export interface Portion {
  date?: string;
  fraction: number; // 0..1 of the whole item
}

/**
 * Splits a read-through into the parts read on each logged day, so a book
 * read across two months counts in both. A finished read gets the remainder
 * on its finish date; a DNF counts only what was logged.
 */
export function readingPortions(item: Item, r: Reading): Portion[] {
  const out: Portion[] = [];
  let done = 0;
  const points = r.log
    .map((e) => ({ date: e.date, fraction: (entryPercent(item, e) ?? -1) / 100 }))
    .filter((p) => p.fraction >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const p of points) {
    const f = Math.min(1, p.fraction);
    if (f > done) {
      out.push({ date: p.date, fraction: f - done });
      done = f;
    }
  }
  if (r.outcome === 'finished' && done < 1) {
    out.push({ date: r.finishDate ?? points.at(-1)?.date, fraction: 1 - done });
  }
  return out;
}

// ---- aggregation ------------------------------------------------------------------

export interface Count {
  name: string;
  count: number;
}

export interface Bucket {
  key: string; // YYYY-MM or YYYY
  label: string;
  books: number;
  fics: number;
  pages: number;
  words: number;
  spent: number;
}

export interface Stats {
  finished: { item: Item; reading: Reading }[];
  finishedBooks: number;
  finishedFics: number;
  undatedFinished: number;
  dnf: number;
  started: number;
  added: number;
  pages: number;
  words: number;
  wordsEstimated: number;
  minutes: number;
  avgRating?: number;
  ratings: { value: number; count: number }[];
  buckets: Bucket[];
  monthly: boolean;
  genres: Count[];
  fandoms: Count[];
  languages: Count[];
  formats: Count[];
  authors: Count[];
  publishers: Count[];
  spent: { total: number; currency: Currency; perCurrency: Partial<Record<Currency, number>>; unconverted: number; purchases: number; free: number };
  longestBook?: { item: Item; pages: number };
  shortestBook?: { item: Item; pages: number };
  longestFic?: { item: Item; words: number };
  avgDays?: number;
}

export interface StatsOptions {
  period: Period;
  type?: ItemType;
  today: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function top(map: Map<string, number>, n = 10): Count[] {
  return [...map]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name))
    .slice(0, n);
}

function bump(map: Map<string, number>, key: string | undefined, by = 1) {
  if (key) map.set(key, (map.get(key) ?? 0) + by);
}

/** Month buckets for spans up to two years, year buckets beyond that. */
function makeBuckets(from: string, to: string): { buckets: Bucket[]; monthly: boolean } {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  const empty = { books: 0, fics: 0, pages: 0, words: 0, spent: 0 };
  if (months <= 24) {
    const out: Bucket[] = [];
    for (let i = 0; i < months; i++) {
      const y = fy + Math.floor((fm - 1 + i) / 12);
      const m = ((fm - 1 + i) % 12) + 1;
      const label = months > 12 && (m === 1 || i === 0) ? `${MONTHS[m - 1]} ’${String(y).slice(2)}` : MONTHS[m - 1];
      out.push({ key: `${y}-${pad(m)}`, label, ...empty });
    }
    return { buckets: out, monthly: true };
  }
  const out: Bucket[] = [];
  for (let y = fy; y <= ty; y++) out.push({ key: String(y), label: String(y), ...empty });
  return { buckets: out, monthly: false };
}

export function computeStats(data: Collections, settings: Settings, opts: StatsOptions): Stats {
  const { period, type, today } = opts;
  const items = new Map(
    data.items.filter((i) => !i.deleted && (!type || i.type === type)).map((i) => [i.id, i]),
  );
  const readings = data.readings.filter((r) => !r.deleted && items.has(r.itemId));
  const currency = settings.displayCurrency;

  // Time range for the buckets: the period, or the span of dated activity for "all time".
  const dates = readings.flatMap((r) => [r.startDate, r.finishDate, ...r.log.map((e) => e.date)]).filter(Boolean) as string[];
  const from = period.from ?? (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today);
  const to = period.to ?? today;
  const { buckets, monthly } = makeBuckets(from, to < from ? from : to);
  const bucketOf = (date: string | undefined) => {
    if (!date) return undefined;
    const key = monthly ? date.slice(0, 7) : date.slice(0, 4);
    return buckets.find((b) => b.key === key);
  };

  const stats: Stats = {
    finished: [],
    finishedBooks: 0,
    finishedFics: 0,
    undatedFinished: 0,
    dnf: 0,
    started: 0,
    added: 0,
    pages: 0,
    words: 0,
    wordsEstimated: 0,
    minutes: 0,
    ratings: [],
    buckets,
    monthly,
    genres: [],
    fandoms: [],
    languages: [],
    formats: [],
    authors: [],
    publishers: [],
    spent: { total: 0, currency, perCurrency: {}, unconverted: 0, purchases: 0, free: 0 },
  };

  const lengths = new Map<string, Length>();
  const lengthOf = (item: Item) => {
    let l = lengths.get(item.id);
    if (!l) lengths.set(item.id, (l = itemLength(item, settings)));
    return l;
  };

  const daySpans: number[] = [];
  for (const r of readings) {
    const item = items.get(r.itemId)!;
    const len = lengthOf(item);

    // Amounts read, on the days they were read.
    for (const p of readingPortions(item, r)) {
      if (!inPeriod(p.date, period)) continue;
      const pages = (len.pages ?? 0) * p.fraction;
      const words = (len.words ?? 0) * p.fraction;
      stats.pages += pages;
      stats.words += words;
      if (len.wordsEstimated) stats.wordsEstimated += words;
      stats.minutes += (len.minutes ?? 0) * p.fraction;
      const b = bucketOf(p.date);
      if (b) {
        b.pages += pages;
        b.words += words;
      }
    }

    if (r.startDate && inPeriod(r.startDate, period)) stats.started++;
    if (r.outcome === 'dnf' && inPeriod(r.finishDate, period)) stats.dnf++;
    if (r.outcome === 'finished' && inPeriod(r.finishDate, period)) {
      stats.finished.push({ item, reading: r });
      if (!r.finishDate) stats.undatedFinished++;
      if (item.type === 'book') stats.finishedBooks++;
      else stats.finishedFics++;
      const b = bucketOf(r.finishDate);
      if (b) {
        if (item.type === 'book') b.books++;
        else b.fics++;
      }
      if (r.startDate && r.finishDate) daySpans.push(daysBetween(r.startDate, r.finishDate) + 1);
    }
  }
  stats.finished.sort((a, b) => (a.reading.finishDate ?? '').localeCompare(b.reading.finishDate ?? ''));
  if (daySpans.length) stats.avgDays = daySpans.reduce((a, b) => a + b, 0) / daySpans.length;

  // Breakdowns count each finished item once, even if re-read in the period.
  const unique = [...new Map(stats.finished.map((f) => [f.item.id, f.item])).values()];
  const name = (coll: 'genres' | 'authors' | 'publishers', id: string | undefined) =>
    (data[coll] as { id: string; name: string; deleted?: boolean }[]).find((r) => r.id === id && !r.deleted)?.name;
  const genres = new Map<string, number>();
  const fandoms = new Map<string, number>();
  const languages = new Map<string, number>();
  const formats = new Map<string, number>();
  const authors = new Map<string, number>();
  const publishers = new Map<string, number>();
  const ratingCounts = new Map<number, number>();
  let ratingSum = 0;
  let rated = 0;
  for (const item of unique) {
    for (const g of item.genreIds) bump(genres, name('genres', g));
    for (const f of item.fic?.fandoms ?? []) bump(fandoms, f);
    bump(languages, item.language ? (LANGUAGE_NAME[item.language] ?? item.language) : 'Not set');
    bump(formats, item.type === 'fic' ? 'Fanfic' : item.book?.format ? FORMAT_LABEL[item.book.format] : 'Not set');
    for (const a of item.authorIds) bump(authors, name('authors', a));
    bump(publishers, name('publishers', item.book?.publisherId));
    if (item.rating) {
      ratingCounts.set(item.rating, (ratingCounts.get(item.rating) ?? 0) + 1);
      ratingSum += item.rating;
      rated++;
    }
    const len = lengthOf(item);
    if (item.type === 'book' && len.pages) {
      if (!stats.longestBook || len.pages > stats.longestBook.pages) stats.longestBook = { item, pages: len.pages };
      if (!stats.shortestBook || len.pages < stats.shortestBook.pages) stats.shortestBook = { item, pages: len.pages };
    }
    if (item.type === 'fic' && len.words && (!stats.longestFic || len.words > stats.longestFic.words)) {
      stats.longestFic = { item, words: len.words };
    }
  }
  stats.genres = top(genres);
  stats.fandoms = top(fandoms);
  stats.languages = top(languages);
  stats.formats = top(formats);
  stats.authors = top(authors);
  stats.publishers = top(publishers);
  stats.ratings = Array.from({ length: 10 }, (_, i) => ({ value: (i + 1) / 2, count: ratingCounts.get((i + 1) / 2) ?? 0 }));
  if (rated) stats.avgRating = ratingSum / rated;

  // Added to the library, and money spent (by purchase date).
  for (const item of items.values()) {
    if (inPeriod(item.createdAt.slice(0, 10), period)) stats.added++;
    for (const p of item.book?.purchases ?? []) {
      if (!inPeriod(p.date, period)) continue;
      if (!p.price) {
        if (p.source !== 'bought') stats.spent.free++;
        continue;
      }
      stats.spent.purchases++;
      stats.spent.perCurrency[p.currency] = (stats.spent.perCurrency[p.currency] ?? 0) + p.price;
      const v = convert(p.price, p.currency, currency, p.fx);
      if (v === undefined) {
        stats.spent.unconverted++;
        continue;
      }
      stats.spent.total += v;
      const b = bucketOf(p.date);
      if (b) b.spent += v;
    }
  }
  return stats;
}

// ---- goals ------------------------------------------------------------------------

/** Where you should be by `today` for a yearly goal: positive = ahead. */
export function goalPace(goal: number, done: number, year: number, today: string): { expected: number; ahead: number } {
  const y = Number(today.slice(0, 4));
  if (year < y) return { expected: goal, ahead: done - goal };
  if (year > y) return { expected: 0, ahead: done };
  const start = Date.UTC(year, 0, 1);
  const days = (Date.UTC(year + 1, 0, 1) - start) / 86_400_000;
  const dayOfYear = (Date.parse(today) - start) / 86_400_000 + 1;
  const expected = (goal * dayOfYear) / days;
  return { expected, ahead: done - expected };
}

/** Finished books and fics in a year (for goals). */
export function finishedInYear(data: Collections, year: number): { books: number; fics: number } {
  const types = new Map(data.items.filter((i) => !i.deleted).map((i) => [i.id, i.type]));
  let books = 0;
  let fics = 0;
  for (const r of data.readings) {
    if (r.deleted || r.outcome !== 'finished' || !r.finishDate?.startsWith(String(year))) continue;
    const t = types.get(r.itemId);
    if (t === 'book') books++;
    else if (t === 'fic') fics++;
  }
  return { books, fics };
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}
