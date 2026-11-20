import { describe, expect, it } from 'vitest';
import { knownStores, storeName } from '../src/lib/purchases';
import type { Item, Purchase } from '../src/lib/types';

const buy = (store?: string): Purchase => ({ id: Math.random().toString(36), currency: 'JPY', source: 'bought', store });
const book = (id: string, stores: (string | undefined)[], extra: Partial<Item> = {}): Item => ({
  id, createdAt: '', updatedAt: '', type: 'book', title: id, authorIds: [], genreIds: [], tagIds: [],
  book: { purchases: stores.map(buy) }, ...extra,
});

describe('stores for the purchase form', () => {
  const items = [
    book('a', ['Amazon JP', 'BookWalker']),
    book('b', ['amazon jp', ' Amazon JP ', undefined, '']),
    book('c', ['Kinokuniya', 'BookWalker']),
    book('d', ['Gone Store'], { deleted: true }),
    { ...book('e', []), type: 'fic' as const, book: undefined },
  ];

  it('lists stores used before, most used first, each once', () => {
    expect(knownStores(items)).toEqual(['Amazon JP', 'BookWalker', 'Kinokuniya']);
  });

  it('adds stores typed in the form but not saved yet', () => {
    expect(knownStores(items, ['honto', undefined, 'kinokuniya', 'Kinokuniya'])).toEqual(['Amazon JP', 'Kinokuniya', 'BookWalker', 'honto']);
    expect(knownStores([])).toEqual([]);
  });

  it('saves a store the way it was spelled before', () => {
    const known = knownStores(items);
    expect(storeName('  amazon jp ', known)).toBe('Amazon JP');
    expect(storeName('Tsutaya', known)).toBe('Tsutaya');
    expect(storeName('   ', known)).toBeUndefined();
    expect(storeName(undefined, known)).toBeUndefined();
  });
});
