// In-memory library backed by IndexedDB. Components read `library.*`;
// all writes go through the methods here so they persist and trigger sync.
import { defaultSettings } from './constants';
import * as db from './db';
import { emptyCollections, mergeCollections } from './merge';
import { deriveStatus, sortReadings, transition } from './reading';
import { COLLECTION_NAMES } from './types';
import type {
  Author,
  BaseRecord,
  CollectionName,
  Collections,
  Item,
  NamedRecord,
  Reading,
  Settings,
  Status,
} from './types';
import { collator, newId, normalize, nowIso, today } from './util';

type Listener = () => void;

export type NamedCollection = 'publishers' | 'genres' | 'tags' | 'series' | 'authors';

class Library {
  data = $state.raw<Collections>(emptyCollections());
  loaded = $state(false);

  items = $derived(this.data.items.filter((i) => !i.deleted));
  itemsById = $derived(new Map(this.data.items.map((i) => [i.id, i])));

  readingsByItem = $derived.by(() => {
    const map = new Map<string, Reading[]>();
    for (const r of this.data.readings) {
      if (r.deleted) continue;
      const list = map.get(r.itemId);
      if (list) list.push(r);
      else map.set(r.itemId, [r]);
    }
    for (const [k, v] of map) map.set(k, sortReadings(v));
    return map;
  });

  statusById = $derived.by(() => {
    const map = new Map<string, Status>();
    for (const item of this.items) map.set(item.id, deriveStatus(this.readingsByItem.get(item.id) ?? []));
    return map;
  });

  settings = $derived<Settings>(
    this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(''),
  );

  #listeners = new Set<Listener>();

  async load(): Promise<void> {
    this.data = await db.loadAll();
    this.loaded = true;
  }

  /** Called after every local change (used to schedule sync). */
  onChange(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) fn();
  }

  /** Inserts or updates records, stamping updatedAt. */
  async put<K extends CollectionName>(name: K, records: Collections[K][number][]): Promise<void> {
    if (records.length === 0) return;
    const now = nowIso();
    const stamped = records.map((r) => ({ ...r, createdAt: r.createdAt || now, updatedAt: now }));
    const ids = new Set(stamped.map((r) => r.id));
    const next = [...(this.data[name] as BaseRecord[]).filter((r) => !ids.has(r.id)), ...stamped];
    this.data = { ...this.data, [name]: next };
    await db.saveRecords(name, stamped);
    this.#emit();
  }

  /** Soft-deletes records so the deletion syncs to other devices. */
  async remove<K extends CollectionName>(name: K, records: BaseRecord[]): Promise<void> {
    await this.put(name, records.map((r) => ({ ...r, deleted: true })) as Collections[K][number][]);
  }

  /**
   * Merges records from another copy of the library (sync or import).
   * Only records newer than the local ones are written. Does not trigger sync.
   * Returns the number of changed records.
   */
  async applyRemote(remote: Collections): Promise<number> {
    const changed: Partial<Record<CollectionName, BaseRecord[]>> = {};
    let count = 0;
    for (const name of COLLECTION_NAMES) {
      const local = new Map((this.data[name] as BaseRecord[]).map((r) => [r.id, r]));
      const newer = (remote[name] as BaseRecord[]).filter((r) => {
        const mine = local.get(r.id);
        return !mine || r.updatedAt > mine.updatedAt;
      });
      if (newer.length) {
        changed[name] = newer;
        count += newer.length;
      }
    }
    if (count === 0) return 0;
    this.data = mergeCollections(this.data, remote);
    for (const [name, records] of Object.entries(changed)) {
      await db.saveRecords(name as CollectionName, records);
    }
    return count;
  }

  // ---- queries -------------------------------------------------------

  item(id: string): Item | undefined {
    const i = this.itemsById.get(id);
    return i && !i.deleted ? i : undefined;
  }

  readings(itemId: string): Reading[] {
    return this.readingsByItem.get(itemId) ?? [];
  }

  status(itemId: string): Status {
    return this.statusById.get(itemId) ?? 'want-to-read';
  }

  named<K extends NamedCollection>(name: K): Collections[K] {
    return (this.data[name] as NamedRecord[])
      .filter((r) => !r.deleted)
      .sort((a, b) => collator.compare(a.name, b.name)) as Collections[K];
  }

  name(collection: NamedCollection, id: string | undefined): string {
    if (!id) return '';
    return (this.data[collection] as NamedRecord[]).find((r) => r.id === id)?.name ?? '';
  }

  names(collection: NamedCollection, ids: string[]): string[] {
    return ids.map((id) => this.name(collection, id)).filter(Boolean);
  }

  authorNames(item: Item): string {
    return this.names('authors', item.authorIds).join(', ');
  }

  /** Items using a reference record (to warn before deleting it). */
  usageCount(collection: NamedCollection, id: string): number {
    return this.items.filter((i) => {
      switch (collection) {
        case 'authors':
          return i.authorIds.includes(id);
        case 'genres':
          return i.genreIds.includes(id);
        case 'tags':
          return i.tagIds.includes(id);
        case 'series':
          return i.seriesId === id;
        case 'publishers':
          return i.book?.publisherId === id;
      }
    }).length;
  }

  /** Distinct values of a fic tag field, for suggestions. */
  ficValues(field: 'fandoms' | 'relationships' | 'characters' | 'additionalTags'): string[] {
    const set = new Set<string>();
    for (const i of this.items) for (const v of i.fic?.[field] ?? []) set.add(v);
    return [...set].sort(collator.compare);
  }

  // ---- writes --------------------------------------------------------

  /** Finds a reference record by name (case-insensitive) or creates it. */
  async ensureNamed(collection: NamedCollection, name: string): Promise<string> {
    const trimmed = name.trim();
    const key = normalize(trimmed);
    const existing = (this.data[collection] as NamedRecord[]).find(
      (r) => !r.deleted && normalize(r.name) === key,
    );
    if (existing) return existing.id;
    const now = nowIso();
    const rec: NamedRecord = { id: newId(), createdAt: now, updatedAt: now, name: trimmed };
    if (collection === 'authors') (rec as Author).altNames = [];
    await this.put(collection, [rec] as never);
    return rec.id;
  }

  async saveItem(item: Item): Promise<void> {
    await this.put('items', [item]);
  }

  async deleteItem(item: Item): Promise<void> {
    await this.remove('readings', this.readings(item.id));
    await this.remove('items', [item]);
  }

  async setStatus(item: Item, target: Status, date = today()): Promise<void> {
    const changes = transition(item, this.readings(item.id), target, date, nowIso());
    await this.put('readings', changes.upsert);
    await this.remove('readings', changes.remove);
  }

  async saveReading(reading: Reading): Promise<void> {
    await this.put('readings', [reading]);
  }

  async deleteReading(reading: Reading): Promise<void> {
    await this.remove('readings', [reading]);
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const current = this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(nowIso());
    await this.put('settings', [{ ...current, ...patch, id: 'settings' }]);
  }
}

export const library = new Library();
