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
  artwork?: string; // album art from Apple Music
  note?: string;
}

/** A file (e.g. an EPUB) kept in the private data repo under files/. */
export interface StoredFile {
  id: string;
  name: string; // original file name, shown and used when downloading
  path: string; // path in the data repo
  size: number; // bytes
  type?: string; // MIME type
  addedAt: string; // ISO timestamp
  /** Where reading stopped in the in-app reader (EPUBs). Synced, so another device continues there. */
  position?: ReaderPosition;
  bookmarks?: ReaderBookmark[];
}

export interface ReaderBookmark {
  id: string;
  cfi: string; // start of the bookmarked page
  fraction: number;
  chapter?: string;
  excerpt?: string; // the page's first words
  at: string;
}

export interface ReaderPosition {
  cfi: string; // EPUB CFI of the place on the page
  fraction: number; // 0–1 through the book
  at: string; // ISO timestamp of the last page turn
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
  files?: StoredFile[];
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

/** One meaning of a word, from a dictionary or written by the reader. */
export interface WordSense {
  pos?: string; // part of speech, e.g. "noun"
  text: string;
  example?: string;
}

export interface WordPronunciation {
  ipa?: string; // e.g. "/həˈləʊ/"
  audio?: string; // https link to a recording
  accent?: string; // e.g. "US", "UK"
}

/** A word the reader learned from a book or fic. */
export interface VocabWord extends BaseRecord {
  itemId: string;
  word: string;
  language?: string; // ISO 639-1 code
  senses: WordSense[];
  manual?: boolean; // meaning written by the reader rather than taken from a dictionary
  source?: string; // dictionary the meaning came from
  sourceUrl?: string;
  pronunciations?: WordPronunciation[];
  note?: string; // e.g. the sentence it appeared in
}

/** A passage saved from a book or fic. */
export interface Quote extends BaseRecord {
  itemId: string;
  text: string;
  location?: string; // where it is: "p. 42", "ch. 3", "loc. 1234"
  note?: string; // the reader's own thoughts on it
  /** Saved from the in-app reader: the EPUB and the place in it, to open the book there again. */
  fileId?: string;
  cfi?: string;
}

export type TimeSource = 'reader' | 'timer' | 'manual';

/** Time spent reading a book or fic: a reader session, a timer, or added by hand. */
export interface ReadingTime extends BaseRecord {
  itemId: string;
  date: string; // YYYY-MM-DD (local) the session started
  start?: string; // ISO timestamp
  seconds: number;
  source: TimeSource;
  /** Reader sessions: where in the book it started and ended (0–1), for reading speed. */
  from?: number;
  to?: number;
}

export type Repeat = 'daily' | 'weekdays' | 'weekly';

/** Planned reading time for a book or fic. Dates and times are local ("floating"). */
export interface ReadingSession extends BaseRecord {
  itemId: string;
  date: string; // YYYY-MM-DD (first date when repeating)
  start: string; // HH:MM
  minutes: number;
  remind?: number; // minutes before the start; undefined = no reminder
  repeat?: Repeat;
  skipped?: string[]; // dates removed from a repeating session
  note?: string;
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
  /** Apple Music storefront for song links, e.g. "us", "jp" (default: the device's region). */
  musicStore?: string;
  /** Minutes a day to aim for (unset or 0 = no goal). */
  dailyGoalMinutes?: number;
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
  vocabulary: VocabWord[];
  schedule: ReadingSession[];
  quotes: Quote[];
  readingTime: ReadingTime[];
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
  'vocabulary',
  'schedule',
  'quotes',
  'readingTime',
];

/** Shape of library.json. */
export interface LibraryFile extends Collections {
  app: 'reading-app';
  /** 2 added `vocabulary`, 3 `schedule`, 4 `quotes`, 5 `readingTime`; older app versions refuse newer files instead of dropping data. */
  schema: 5;
  savedAt: string;
}
