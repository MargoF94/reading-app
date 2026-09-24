// In-memory library backed by IndexedDB. Components read `library.*`;
// all writes go through the methods here so they persist and trigger sync.
import { defaultSettings } from './constants';
import { discardCover } from './covers';
import * as db from './db';
import { emptyCollections, mergeCollections } from './merge';
import { deriveStatus, sortReadings, transition } from './reading';
import { COLLECTION_NAMES } from './types';
import type {
  Author,
  BaseRecord,
  Goal,
  CollectionName,
  Collections,
  Item,
  NamedRecord,
  Reading,
  ReadingList,
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

  lists = $derived(
    this.data.lists.filter((l) => !l.deleted).sort((a, b) => collator.compare(a.name, b.name)),
  );

  settings = $derived<Settings>(
    this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(''),
  );

  #listeners = new Set<Listener>();

  // Other open tabs of the app (e.g. one opened by a bookmarklet) share their
  // changes here, so every tab's in-memory copy stays current and can sync it.
  #channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('reading-app-library') : null;

  constructor() {
    this.#channel?.addEventListener('message', (e: MessageEvent) => {
      const { name, records, local } = e.data as { name: CollectionName; records: BaseRecord[]; local: boolean };
      if (!this.loaded || !COLLECTION_NAMES.includes(name)) return;
      // Already saved to IndexedDB by the other tab: only update memory.
      this.data = mergeCollections(this.data, { ...emptyCollections(), [name]: records });
      if (local) this.#emit();
    });
  }

  #broadcast(name: CollectionName, records: BaseRecord[], local: boolean) {
    try {
      this.#channel?.postMessage({ name, records, local });
    } catch {
      /* ignore: another tab will catch up when it next loads */
    }
  }

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
    // Snapshot: records may contain reactive proxies, which IndexedDB cannot store.
    const stamped = records.map((r) => ({ ...$state.snapshot(r), createdAt: r.createdAt || now, updatedAt: now }));
    const ids = new Set(stamped.map((r) => r.id));
    const next = [...(this.data[name] as BaseRecord[]).filter((r) => !ids.has(r.id)), ...stamped];
    this.data = { ...this.data, [name]: next };
    await db.saveRecords(name, stamped);
    this.#broadcast(name, stamped, true);
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
      this.#broadcast(name as CollectionName, records, false);
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
    await discardCover(item.coverUrl);
  }

  /** Adds many records at once (imports). */
  async importRecords(records: Partial<Collections>): Promise<void> {
    for (const name of COLLECTION_NAMES) {
      const recs = records[name];
      if (recs?.length) await this.put(name, recs as never);
    }
  }

  /** Existing fic with this AO3 work id. */
  ficByWorkId(workId: string | undefined): Item | undefined {
    return workId ? this.items.find((i) => i.fic?.workId === workId) : undefined;
  }

  /** Existing book with this Goodreads id or ISBN-13. */
  bookByIds(goodreadsUrl?: string, isbn13?: string): Item | undefined {
    const gr = goodreadsUrl?.match(/book\/show\/(\d+)/)?.[1];
    return this.items.find(
      (i) =>
        i.type === 'book' &&
        ((gr && i.book?.goodreadsUrl?.match(/book\/show\/(\d+)/)?.[1] === gr) || (isbn13 && i.book?.isbn13 === isbn13)),
    );
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

  // ---- editions ---------------------------------------------------------

  editionsOf(item: Item): Item[] {
    return item.workKey ? this.items.filter((i) => i.workKey === item.workKey && i.id !== item.id) : [];
  }

  /** Marks two items as editions of the same work (merging existing groups). */
  async linkEditions(a: Item, b: Item): Promise<void> {
    const key = a.workKey ?? b.workKey ?? newId();
    const old = new Set([a.workKey, b.workKey].filter((k): k is string => !!k && k !== key));
    const changed = this.items.filter((i) => i.id === a.id || i.id === b.id || (i.workKey && old.has(i.workKey)));
    await this.put('items', changed.filter((i) => i.workKey !== key).map((i) => ({ ...i, workKey: key })));
  }

  async unlinkEdition(item: Item): Promise<void> {
    const others = this.editionsOf(item);
    const changed = [{ ...item, workKey: undefined }];
    // A group of one is no group.
    if (others.length === 1) changed.push({ ...others[0], workKey: undefined });
    await this.put('items', changed);
  }

  // ---- lists ------------------------------------------------------------

  list(id: string): ReadingList | undefined {
    return this.lists.find((l) => l.id === id);
  }

  listsContaining(itemId: string): ReadingList[] {
    return this.lists.filter((l) => l.entries.some((e) => e.itemId === itemId));
  }

  async createList(name: string, description?: string): Promise<ReadingList> {
    const now = nowIso();
    const list: ReadingList = { id: newId(), createdAt: now, updatedAt: now, name: name.trim(), description, entries: [] };
    await this.put('lists', [list]);
    return list;
  }

  async saveList(list: ReadingList): Promise<void> {
    await this.put('lists', [list]);
  }

  async addToList(list: ReadingList, itemId: string): Promise<void> {
    if (list.entries.some((e) => e.itemId === itemId)) return;
    await this.put('lists', [{ ...list, entries: [...list.entries, { itemId }] }]);
  }

  async removeFromList(list: ReadingList, itemId: string): Promise<void> {
    await this.put('lists', [{ ...list, entries: list.entries.filter((e) => e.itemId !== itemId) }]);
  }

  // ---- goals --------------------------------------------------------------

  goal(year: number): Goal | undefined {
    return this.data.goals.find((g) => g.year === year && !g.deleted);
  }

  async saveGoal(year: number, patch: Partial<Pick<Goal, 'books' | 'fics'>>): Promise<void> {
    const now = nowIso();
    const current = this.goal(year) ?? { id: `goal-${year}`, createdAt: now, updatedAt: now, year };
    await this.put('goals', [{ ...current, ...patch }]);
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const current = this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(nowIso());
    await this.put('settings', [{ ...current, ...patch, id: 'settings' }]);
  }
}

export const library = new Library();
