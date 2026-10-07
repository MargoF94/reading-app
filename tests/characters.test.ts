import { describe, expect, it } from 'vitest';
import { appearances, characterForTag, characterIndex, charKey, mainImage, splitNames, tagName } from '../src/lib/characters';
import type { Character, Item } from '../src/lib/types';

const base = { createdAt: 'a', updatedAt: 'a' };
const ch = (id: string, name: string, altNames: string[] = [], extra: Partial<Character> = {}): Character => ({ ...base, id, name, altNames, ...extra });
const book = (id: string, characterIds: string[]) => ({ ...base, id, type: 'book', title: id, authorIds: [], genreIds: [], tagIds: [], characterIds }) as unknown as Item;
const fic = (id: string, characters: string[]) =>
  ({ ...base, id, type: 'fic', title: id, authorIds: [], genreIds: [], tagIds: [], fic: { site: 'ao3', warnings: [], categories: [], fandoms: [], relationships: [], additionalTags: [], complete: true, characters } }) as unknown as Item;

describe('characters', () => {
  it('drops AO3’s fandom in brackets and ignores case', () => {
    expect(tagName('Piranesi (Piranesi - Susanna Clarke)')).toBe('Piranesi');
    expect(charKey('THE  Other')).toBe(charKey('the other'));
    expect(tagName('(Untitled)')).toBe('(Untitled)');
  });

  it('puts a book’s characters and matching fic tags on one page', () => {
    const chars = [ch('p', 'Piranesi', ['Matthew Rose Sorensen'])];
    const items = [book('b1', ['p']), fic('f1', ['Piranesi (Piranesi - Susanna Clarke)', 'Raphael']), fic('f2', ['Matthew Rose Sorensen', 'Raphael'])];
    const idx = characterIndex(chars, items);
    expect(idx.map((e) => [e.name, e.books, e.fics, !!e.character])).toEqual([
      ['Piranesi', 1, 2, true],
      ['Raphael', 0, 2, false],
    ]);
    expect(characterForTag(chars, 'piranesi (Piranesi)')?.id).toBe('p');
    expect(characterForTag(chars, 'Raphael')).toBeUndefined();
  });

  it('lists characters without appearances, skips deleted ones and counts an item once', () => {
    const idx = characterIndex([ch('a', 'Alone'), ch('d', 'Gone', [], { deleted: true }), ch('p', 'Piranesi', ['Pira'])], [fic('f', ['Piranesi', 'Pira'])]);
    expect(idx.map((e) => [e.name, e.fics])).toEqual([
      ['Alone', 0],
      ['Piranesi', 1],
    ]);
  });

  it('helpers', () => {
    const c = ch('x', 'X', [], { images: [{ id: '1', url: 'a', addedAt: 'a' }, { id: '2', url: 'b', addedAt: 'a' }], mainImageId: '2' });
    expect(mainImage(c)?.id).toBe('2');
    expect(mainImage(ch('y', 'Y'))).toBeUndefined();
    expect(appearances(1, 3)).toBe('1 book · 3 fics');
    expect(splitNames('Piranesi, Matthew Rose Sorensen、ピラネージ, Piranesi')).toEqual(['Piranesi', 'Matthew Rose Sorensen', 'ピラネージ']);
  });
});
