import { describe, expect, it } from 'vitest';
import { coverText, cracks, isCjk, seedOf, shipLabel, shortFandom, shortName, titleScale, variant, windowTracery } from '../src/lib/placeholderCover';
import type { Item, ItemType } from '../src/lib/types';

const item = (type: ItemType, title: string, fields: Partial<Item> = {}): Item =>
  ({ id: title, createdAt: '', updatedAt: '', type, title, authorIds: [], genreIds: [], tagIds: [], ...fields }) as Item;
const fic = (fandoms: string[], relationships: string[] = [], title = 'A Fic') =>
  item('fic', title, { fic: { site: 'ao3', warnings: [], categories: [], fandoms, relationships, characters: [], additionalTags: [], complete: true } });

describe('covers for books and fics without a picture', () => {
  it('writes fandoms short', () => {
    expect(shortFandom('Rise of the Guardians (2012)')).toBe('Rise of the Guardians');
    expect(shortFandom('Harry Potter - J. K. Rowling')).toBe('Harry Potter');
    expect(shortFandom('Star Wars - All Media Types')).toBe('Star Wars');
    expect(shortFandom('呪術廻戦 | Jujutsu Kaisen (Anime)')).toBe('Jujutsu Kaisen');
    expect(shortFandom('Original Work')).toBe('Original Work');
  });

  it('writes the pairing with the names characters go by', () => {
    expect(shipLabel(fic(['x'], ['Jack Frost/Pitch Black']))).toBe('Jack / Pitch');
    expect(shipLabel(fic(['x'], ['Aziraphale/Crowley (Good Omens)']))).toBe('Aziraphale / Crowley');
    expect(shipLabel(fic(['x'], ['Geralt z Rivii | Geralt of Rivia/Jaskier | Dandelion']))).toBe('Geralt / Jaskier');
    expect(shipLabel(fic(['x'], ['Sherlock Holmes & John Watson']))).toBe('Sherlock & John');
    expect(shipLabel(fic(['x'], []))).toBeUndefined();
    expect(shortName('E. Aster Bunnymund')).toBe('Aster');
    expect(shortName('Mo')).toBe('Mo');
  });

  it('puts the fandom or series, the pairing or number, around the title', () => {
    expect(coverText(fic(['Good Omens (TV)'], ['Aziraphale/Crowley']))).toEqual({ label: 'Good Omens', subtitle: 'Aziraphale / Crowley', tagline: 'Archive of Our Own' });
    expect(coverText(fic([]))).toEqual({ label: 'Archive of Our Own', subtitle: undefined, tagline: undefined });
    expect(coverText(item('book', 'The Glass Abbey', { seriesNumber: '1' }), 'Saint Ives')).toEqual({ label: 'Saint Ives', subtitle: 'Book 1' });
    expect(coverText(item('manga', 'Harbor Lights', { seriesNumber: '3' }), 'Harbor Lights')).toEqual({ label: 'Harbor Lights', subtitle: 'Volume 3' });
    // The title already says which volume it is.
    expect(coverText(item('manga', 'Lantern Street, Vol. 2', { seriesNumber: '2' }), 'Lantern Street').subtitle).toBeUndefined();
    expect(coverText(item('book', 'The Quiet Year'))).toEqual({ label: undefined, subtitle: undefined });
  });

  it('sizes titles', () => {
    expect(titleScale('Ash')).toBe(1.25);
    expect(titleScale('The Long Way Home')).toBe(1);
    expect(titleScale('夜明けの手紙')).toBe(1); // six wide letters count as twelve
    expect(titleScale('An Unexpected Inheritance of Teacups, Ghosts, and Other Small Disasters')).toBe(0.7);
    expect(isCjk('夜明け')).toBe(true);
    expect(isCjk('Всё')).toBe(false);
  });

  it('draws each item its own way, the same every time', () => {
    const a = item('book', 'One');
    const b = item('book', 'Two');
    expect(cracks(seedOf(a))).toEqual(cracks(seedOf(a)));
    expect(cracks(seedOf(a))).not.toEqual(cracks(seedOf(b)));
    expect(cracks(seedOf(a)).length).toBeGreaterThanOrEqual(2); // two cracks, and the places they fork
    for (const k of [0, 1, 2]) expect(windowTracery(k).every((t) => t.d.startsWith('M') && t.w > 0)).toBe(true);
    expect(new Set(Array.from({ length: 30 }, (_, i) => variant(seedOf(item('book', `Book ${i}`)), 3)))).toEqual(new Set([0, 1, 2]));
  });
});
