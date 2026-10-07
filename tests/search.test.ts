import { describe, expect, it } from 'vitest';
import { searchAll, snippet } from '../src/lib/search';
import type { Item, Quote, VocabWord } from '../src/lib/types';

const base = { createdAt: 'a', updatedAt: 'a' };
const item = (id: string, title: string, extra: Partial<Item> = {}) =>
  ({ ...base, id, type: 'book', title, authorIds: [], genreIds: [], tagIds: [], ...extra }) as Item;
const items = [
  item('a', 'The Lantern Room', { review: 'Loved it.' }),
  item('b', 'Kostio', { notes: 'the lantern scene is the best thing in the book' }),
  item('c', 'カラーレシピ'),
];
const quotes: Quote[] = [{ ...base, id: 'q', itemId: 'a', text: 'The lantern room had been closed for eleven winters.', location: 'ch. 3' }];
const words: VocabWord[] = [{ ...base, id: 'w', itemId: 'b', word: 'ephemeral', senses: [{ text: 'lasting a very short time, like lantern light' }] }];
const src = { items, quotes, words, facets: (i: Item) => (i.id === 'b' ? ([['tag', 'lantern-lit']] as [string, string][]) : []) };

describe('search', () => {
  it('finds titles, facets, quotes, words and notes', () => {
    const r = searchAll(src, 'Lantern');
    expect(r.item.map((h) => [h.id, h.where])).toEqual([
      ['a', undefined],
      ['b', 'tag'],
    ]);
    expect(r.quote[0].where).toBe('ch. 3');
    expect(r.word[0].where).toBe('ephemeral');
    expect(r.note.map((h) => h.id)).toEqual(['b:Notes']);
  });

  it('marks the match with text around it', () => {
    const s = snippet('The lantern room had been closed', 'room', 5)!;
    expect(s).toEqual({ before: '…tern ', match: 'room', after: ' had…' });
  });

  it('matches katakana with hiragana and ignores case', () => {
    expect(searchAll(src, 'からー').item.map((h) => h.id)).toEqual(['c']);
    expect(searchAll(src, 'EPHEM').word).toHaveLength(1);
    expect(searchAll(src, '  ').item).toHaveLength(0);
  });
});
