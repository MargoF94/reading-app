import { describe, expect, it } from 'vitest';
import { pinnedItems, unpinsOn } from '../src/lib/pins';
import type { Item } from '../src/lib/types';

const t = '2026-01-01T00:00:00.000Z';
const item = (id: string, fields: Partial<Item> = {}): Item => ({ id, createdAt: t, updatedAt: t, type: 'book', title: id, authorIds: [], genreIds: [], tagIds: [], ...fields });

describe('pins on Home', () => {
  it('lists pinned items, the most recently pinned first', () => {
    const items = [
      item('a', { pinnedAt: '2026-11-01T10:00:00.000Z' }),
      item('b'),
      item('c', { pinnedAt: '2026-11-03T08:00:00.000Z' }),
      item('d', { pinnedAt: '2026-11-02T09:00:00.000Z', deleted: true }),
    ];
    expect(pinnedItems(items).map((i) => i.id)).toEqual(['c', 'a']);
    expect(pinnedItems([])).toEqual([]);
  });

  it('finishing or stopping a book unpins it; other changes keep it', () => {
    expect(unpinsOn('read')).toBe(true);
    expect(unpinsOn('dnf')).toBe(true);
    expect(unpinsOn('currently-reading')).toBe(false);
    expect(unpinsOn('on-hold')).toBe(false);
    expect(unpinsOn('want-to-read')).toBe(false);
  });
});
