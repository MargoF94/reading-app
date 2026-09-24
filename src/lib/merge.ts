import { COLLECTION_NAMES, type BaseRecord, type Collections, type LibraryFile } from './types';

export function emptyCollections(): Collections {
  return {
    items: [],
    readings: [],
    authors: [],
    publishers: [],
    series: [],
    genres: [],
    tags: [],
    lists: [],
    goals: [],
    settings: [],
  };
}

/** Merges two versions of a collection; for each id the newest `updatedAt` wins. */
export function mergeRecords<T extends BaseRecord>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const rec of [...a, ...b]) {
    const existing = byId.get(rec.id);
    if (!existing || rec.updatedAt > existing.updatedAt) byId.set(rec.id, rec);
  }
  return [...byId.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export function mergeCollections(a: Collections, b: Collections): Collections {
  const out = emptyCollections();
  for (const name of COLLECTION_NAMES) {
    (out as unknown as Record<string, BaseRecord[]>)[name] = mergeRecords((a[name] ?? []) as BaseRecord[], (b[name] ?? []) as BaseRecord[]);
  }
  return out;
}

/** JSON with sorted keys and 2-space indent so git diffs of library.json stay readable. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function toLibraryFile(c: Collections, savedAt: string): LibraryFile {
  const sorted = mergeCollections(c, emptyCollections());
  return { app: 'reading-app', schema: 1, savedAt, ...sorted };
}

/** Accepts library.json (or an exported backup) and returns its collections. */
export function parseLibraryFile(text: string): Collections {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || data.app !== 'reading-app') {
    throw new Error('This file is not a Reading Log library.');
  }
  if (data.schema > 1) {
    throw new Error('This library was saved by a newer version of the app. Reload the page to update.');
  }
  const out = emptyCollections();
  for (const name of COLLECTION_NAMES) {
    if (Array.isArray(data[name])) (out as unknown as Record<string, unknown>)[name] = data[name];
  }
  return out;
}

/** Content comparison that ignores savedAt. */
export function sameContent(a: Collections, b: Collections): boolean {
  const pick = (c: Collections) =>
    stableStringify(Object.fromEntries(COLLECTION_NAMES.map((n) => [n, mergeRecords(c[n] as BaseRecord[], [])])));
  return pick(a) === pick(b);
}
