// Browse pages: groups of items by author, series, genre, tag, publisher or AO3 tag.
// Plain functions over the library; call them inside $derived to stay reactive.
import { library } from './store.svelte';
import type { Author, Item, NamedRecord } from './types';
import { collator } from './util';

export type BrowseKind =
  | 'series'
  | 'authors'
  | 'genres'
  | 'tags'
  | 'publishers'
  | 'fandoms'
  | 'relationships'
  | 'characters'
  | 'fictags';

export const BROWSE_KINDS: { kind: BrowseKind; label: string; singular: string }[] = [
  { kind: 'series', label: 'Series', singular: 'Series' },
  { kind: 'authors', label: 'Authors', singular: 'Author' },
  { kind: 'genres', label: 'Genres', singular: 'Genre' },
  { kind: 'tags', label: 'Tags', singular: 'Tag' },
  { kind: 'fandoms', label: 'Fandoms', singular: 'Fandom' },
  { kind: 'relationships', label: 'Relationships', singular: 'Relationship' },
  { kind: 'characters', label: 'Characters', singular: 'Character' },
  { kind: 'fictags', label: 'AO3 tags', singular: 'AO3 tag' },
  { kind: 'publishers', label: 'Publishers', singular: 'Publisher' },
];

export function kindInfo(kind: string) {
  return BROWSE_KINDS.find((k) => k.kind === kind);
}

const FIC_FIELD = {
  fandoms: 'fandoms',
  relationships: 'relationships',
  characters: 'characters',
  fictags: 'additionalTags',
} as const;

/** Keys an item belongs to for a kind (record ids, or tag names for AO3 kinds). */
export function keysOf(item: Item, kind: BrowseKind): string[] {
  switch (kind) {
    case 'series':
      return item.seriesId ? [item.seriesId] : [];
    case 'authors':
      return item.authorIds;
    case 'genres':
      return item.genreIds;
    case 'tags':
      return item.tagIds;
    case 'publishers':
      return item.book?.publisherId ? [item.book.publisherId] : [];
    default:
      return item.fic?.[FIC_FIELD[kind]] ?? [];
  }
}

const RECORD_COLLECTION = {
  series: 'series',
  authors: 'authors',
  genres: 'genres',
  tags: 'tags',
  publishers: 'publishers',
} as const;

export function nameOf(kind: BrowseKind, key: string): string {
  if (kind in RECORD_COLLECTION) return library.name(RECORD_COLLECTION[kind as keyof typeof RECORD_COLLECTION], key);
  return key;
}

export function recordOf(kind: BrowseKind, key: string): NamedRecord | undefined {
  if (!(kind in RECORD_COLLECTION)) return undefined;
  const coll = RECORD_COLLECTION[kind as keyof typeof RECORD_COLLECTION];
  return (library.data[coll] as NamedRecord[]).find((r) => r.id === key && !r.deleted);
}

export interface BrowseEntry {
  key: string;
  name: string;
  count: number;
  read: number;
  sub?: string;
}

/** Every group of a kind with how many items it has and how many are read. */
export function browseIndex(kind: BrowseKind): BrowseEntry[] {
  const groups = new Map<string, { count: number; read: number }>();
  for (const item of library.items) {
    const read = library.status(item.id) === 'read' ? 1 : 0;
    for (const key of keysOf(item, kind)) {
      const g = groups.get(key) ?? { count: 0, read: 0 };
      g.count++;
      g.read += read;
      groups.set(key, g);
    }
  }
  const out: BrowseEntry[] = [];
  for (const [key, g] of groups) {
    const name = nameOf(kind, key);
    if (!name) continue;
    const rec = recordOf(kind, key);
    let sub: string | undefined;
    if (kind === 'authors') sub = ((rec as Author | undefined)?.altNames ?? []).join(', ') || undefined;
    out.push({ key, name, count: g.count, read: g.read, sub });
  }
  return out.sort((a, b) => collator.compare(a.name, b.name));
}

export function itemsFor(kind: BrowseKind, key: string): Item[] {
  return library.items.filter((i) => keysOf(i, kind).includes(key));
}

/** Numeric position for sorting "2", "2.5", "3-4"; unnumbered last. */
export function seriesPosition(n: string | undefined): number {
  const v = parseFloat(n ?? '');
  return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
}

export interface SeriesRow {
  position?: number;
  item?: Item; // undefined = gap (not in the library)
}

/** Reading order with gaps for missing whole numbers up to the series length. */
export function seriesRows(items: Item[], totalCount?: number): SeriesRow[] {
  const sorted = [...items].sort(
    (a, b) => seriesPosition(a.seriesNumber) - seriesPosition(b.seriesNumber) || collator.compare(a.title, b.title),
  );
  const numbered = sorted.filter((i) => Number.isFinite(seriesPosition(i.seriesNumber)));
  const unnumbered = sorted.filter((i) => !Number.isFinite(seriesPosition(i.seriesNumber)));
  const max = Math.max(totalCount ?? 0, ...numbered.map((i) => Math.floor(seriesPosition(i.seriesNumber))), 0);
  const rows: SeriesRow[] = [];
  const have = new Set(numbered.map((i) => Math.floor(seriesPosition(i.seriesNumber))));
  let idx = 0;
  for (let n = 1; n <= max; n++) {
    while (idx < numbered.length && seriesPosition(numbered[idx].seriesNumber) < n) {
      rows.push({ position: seriesPosition(numbered[idx].seriesNumber), item: numbered[idx] });
      idx++;
    }
    if (!have.has(n)) rows.push({ position: n });
    while (idx < numbered.length && Math.floor(seriesPosition(numbered[idx].seriesNumber)) === n) {
      rows.push({ position: seriesPosition(numbered[idx].seriesNumber), item: numbered[idx] });
      idx++;
    }
  }
  while (idx < numbered.length) {
    rows.push({ position: seriesPosition(numbered[idx].seriesNumber), item: numbered[idx] });
    idx++;
  }
  for (const item of unnumbered) rows.push({ item });
  return rows;
}
