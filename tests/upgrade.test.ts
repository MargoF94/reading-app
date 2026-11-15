import { describe, expect, it } from 'vitest';
import { emptyCollections } from '../src/lib/merge';
import type { Item, Reading } from '../src/lib/types';
import { upgradeCollections, upgradeItem, upgradeReading, upgrades } from '../src/lib/upgrade';

const t = '2026-01-01T00:00:00.000Z';
const item = (id: string, fields: Partial<Item>): Item =>
  ({ id, createdAt: t, updatedAt: t, type: 'book', title: id, authorIds: [], genreIds: [], tagIds: [], ...fields }) as Item;
const reading = (id: string, fields: Partial<Reading>): Reading =>
  ({ id, createdAt: t, updatedAt: t, itemId: 'x', outcome: 'finished', unit: 'pages', log: [], ...fields }) as Reading;

describe('records from older versions', () => {
  // Saved before manga was a type: a book in the "manga" format.
  const oldManga = item('m', { book: { format: 'manga' as never, pageCount: 190, isbn13: '9780306406157', purchases: [] } });

  it('turns books in the manga format into manga', () => {
    const up = upgradeItem(oldManga)!;
    expect(up.type).toBe('manga');
    expect(up.book).toEqual({ pageCount: 190, isbn13: '9780306406157', purchases: [] });
    expect(up.updatedAt).toBe(t); // unchanged here; the store stamps it when saving
    expect(upgradeItem(up)).toBeUndefined(); // only once
    expect(upgradeItem(item('b', { book: { format: 'paperback', purchases: [] } }))).toBeUndefined();
    expect(upgradeItem(item('f', { type: 'fic' }))).toBeUndefined();
  });

  it('drops the manga format from read-throughs', () => {
    expect(upgradeReading(reading('r', { format: 'manga' as never }))).not.toHaveProperty('format');
    expect(upgradeReading(reading('r', { format: 'ebook' }))).toBeUndefined();
  });

  it('upgrades only what needs it', () => {
    const c = { ...emptyCollections(), items: [oldManga, item('b', {})], readings: [reading('r1', { format: 'manga' as never }), reading('r2', {})] };
    const up = upgrades(c);
    expect(up.items.map((i) => i.id)).toEqual(['m']);
    expect(up.readings.map((r) => r.id)).toEqual(['r1']);
    const all = upgradeCollections(c);
    expect(all.items.map((i) => i.type)).toEqual(['manga', 'book']);
    expect(all.items[1]).toBe(c.items[1]);
    expect(all.readings[0]).not.toHaveProperty('format');
  });
});
