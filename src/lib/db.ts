import Dexie, { type Table } from 'dexie';
import { COLLECTION_NAMES, type BaseRecord, type Collections } from './types';
import { emptyCollections } from './merge';

/** Device-local key/value data that is never synced (sync token, UI prefs). */
export interface MetaRow {
  key: string;
  value: unknown;
}

/** A cover photo uploaded from this device, or downloaded from the data repo. */
export interface CoverFile {
  path: string; // e.g. covers/<item id>-<stamp>.webp
  blob: Blob;
  pending: boolean; // not yet uploaded to the data repo
}

class ReadingDb extends Dexie {
  meta!: Table<MetaRow, string>;
  coverFiles!: Table<CoverFile, string>;

  constructor() {
    super('reading-app');
    const schema: Record<string, string> = { meta: 'key' };
    for (const name of COLLECTION_NAMES) schema[name] = 'id';
    this.version(1).stores(schema);
    this.version(2).stores({ ...schema, coverFiles: 'path' });
  }

  table_(name: keyof Collections): Table<BaseRecord, string> {
    return this.table(name);
  }
}

export const db = new ReadingDb();

export async function loadAll(): Promise<Collections> {
  const out = emptyCollections();
  for (const name of COLLECTION_NAMES) {
    (out as unknown as Record<string, BaseRecord[]>)[name] = await db.table_(name).toArray();
  }
  return out;
}

export async function saveRecords(name: keyof Collections, records: BaseRecord[]): Promise<void> {
  await db.table_(name).bulkPut(records);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
