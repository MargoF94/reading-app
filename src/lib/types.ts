// Data model. Everything here is stored in IndexedDB and synced to
// library.json in the private data repo, so changes must stay backwards
// compatible (add optional fields, never rename).

/** Every synced record. `deleted` records are tombstones kept so deletions sync. */
export interface BaseRecord {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp, used to merge devices (newest wins)
  deleted?: boolean;
}

export type ItemType = 'book' | 'fic';

export type BookFormat = 'hardcover' | 'paperback' | 'ebook' | 'manga' | 'audiobook' | 'other';

/** Shown status. Derived from read-throughs, never stored. */
export type Status = 'want-to-read' | 'currently-reading' | 'on-hold' | 'read' | 'dnf';

export type Currency = 'JPY' | 'USD';

export type PurchaseSource = 'bought' | 'free' | 'library' | 'gift' | 'subscription';

/** Exchange rates on a given day, as units of each currency per 1 USD. */
export interface FxSnapshot {
  date: string; // YYYY-MM-DD the rates are for
  perUsd: Partial<Record<Currency, number>>;
  manual?: boolean; // typed in by hand rather than looked up
}

export interface Purchase {
  id: string;
  date?: string; // YYYY-MM-DD
  price?: number;
  currency: Currency;
  store?: string;
  source: PurchaseSource;
  note?: string;
  fx?: FxSnapshot;
}

export type Ao3Rating = 'general' | 'teen' | 'mature' | 'explicit' | 'not-rated';

export interface FicDetails {
  url?: string;
  site: 'ao3';
  workId?: string;
  rating?: Ao3Rating;
  warnings: string[];
  categories: string[];
  fandoms: string[];
  relationships: string[];
  characters: string[];
  additionalTags: string[];
  publishedDate?: string;
  updatedDate?: string;
  completedDate?: string;
  complete: boolean;
  chaptersAvailable?: number;
  chaptersTotal?: number; // undefined = "?"
  kudos?: number;
  hits?: number;
  bookmarks?: number;
  comments?: number;
  statsDate?: string; // when the snapshot above was taken
}

export interface BookDetails {
  isbn13?: string;
  isbn10?: string;
  publisherId?: string;
  publicationDate?: string; // YYYY, YYYY-MM or YYYY-MM-DD
  originalPublicationYear?: number;
  format?: BookFormat;
  pageCount?: number;
  durationMinutes?: number; // audiobooks
  narrator?: string;
  goodreadsUrl?: string;
  /** When missing details were last fetched from the book's Goodreads page (YYYY-MM-DD). */
  goodreadsCheckedAt?: string;
  purchases: Purchase[];
}

/** A song the reader associates with a book or fic (a soundtrack, a vibe). */
export interface Song {
  id: string;
  title: string;
  artist?: string;
  url?: string; // http(s) link to listen
  note?: string;
}

export interface Item extends BaseRecord {
  type: ItemType;
  title: string;
  originalTitle?: string;
  titleReading?: string; // furigana / romanisation
  authorIds: string[];
  language?: string; // ISO 639-1 code
  originalLanguage?: string;
  genreIds: string[];
  tagIds: string[];
  seriesId?: string;
  seriesNumber?: string; // string to allow "1.5", "3-4"
  description?: string;
  coverUrl?: string;
  rating?: number; // 0.5 .. 5 in 0.5 steps
  review?: string; // Markdown
  reviewSpoiler?: boolean;
  wordCount?: number;
  wordCountEstimated?: boolean;
  notes?: string;
  songs?: Song[];
  /** Shared by editions of the same work (e.g. a Japanese original and its translation). */
  workKey?: string;
  book?: BookDetails;
  fic?: FicDetails;
}

export type ProgressUnit = 'pages' | 'percent' | 'chapters' | 'minutes';

export interface ProgressEntry {
  id: string;
  date: string; // YYYY-MM-DD
  value: number;
  unit: ProgressUnit;
  note?: string;
}

export type ReadingOutcome = 'reading' | 'on-hold' | 'finished' | 'dnf';

/** One read-through of an item. Re-reads are additional records. */
export interface Reading extends BaseRecord {
  itemId: string;
  startDate?: string; // YYYY-MM-DD
  finishDate?: string; // YYYY-MM-DD, also the DNF date
  outcome: ReadingOutcome;
  unit: ProgressUnit; // default unit for the next progress update
  log: ProgressEntry[];
  format?: BookFormat;
}

/** Simple named reference data: publishers, genres, tags, fandom-agnostic. */
export interface NamedRecord extends BaseRecord {
  name: string;
}

export interface Author extends NamedRecord {
  altNames: string[]; // names in other scripts
}

export interface Series extends NamedRecord {
  totalCount?: number;
}

export interface ListEntry {
  itemId: string;
  note?: string;
}

export interface ReadingList extends NamedRecord {
  description?: string;
  entries: ListEntry[];
}

export interface Goal extends BaseRecord {
  year: number;
  books?: number;
  fics?: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings extends BaseRecord {
  id: 'settings';
  theme: Theme;
  displayCurrency: Currency;
  /** Estimated words per printed page, by language code. */
  wordsPerPage: Record<string, number>;
  /** Japanese characters counted as one word. */
  jaCharsPerWord: number;
  audiobookWordsPerHour: number;
  mangaCountsWords: boolean;
  /** Length of the "average book" fics are compared with (pages). */
  bookEquivalentPages?: number;
  /** Optional Google Books API key; unauthenticated requests share a small quota. */
  googleBooksKey?: string;
}

/** Collections synced as arrays in library.json. */
export interface Collections {
  items: Item[];
  readings: Reading[];
  authors: Author[];
  publishers: NamedRecord[];
  series: Series[];
  genres: NamedRecord[];
  tags: NamedRecord[];
  lists: ReadingList[];
  goals: Goal[];
  settings: Settings[];
}

export type CollectionName = keyof Collections;

export const COLLECTION_NAMES: CollectionName[] = [
  'items',
  'readings',
  'authors',
  'publishers',
  'series',
  'genres',
  'tags',
  'lists',
  'goals',
  'settings',
];

/** Shape of library.json. */
export interface LibraryFile extends Collections {
  app: 'reading-app';
  schema: 1;
  savedAt: string;
}
