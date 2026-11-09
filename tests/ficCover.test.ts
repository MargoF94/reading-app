import { describe, expect, it } from 'vitest';
import { BAND_COLORS, ficCoverColors, mix, shipLabel, shortFandom, shortName, titleScale } from '../src/lib/ficCover';
import type { Item } from '../src/lib/types';

const fic = (fandoms: string[], relationships: string[] = [], title = 'A Fic') =>
  ({
    id: 'x',
    type: 'fic',
    title,
    authorIds: [],
    genreIds: [],
    tagIds: [],
    fic: { site: 'ao3', warnings: [], categories: [], fandoms, relationships, characters: [], additionalTags: [], complete: true },
  }) as unknown as Item;

describe('covers for fics without a picture', () => {
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

  it('gives a fandom’s fics the same colours', () => {
    const a = ficCoverColors(fic(['Good Omens (TV)'], [], 'One'));
    const b = ficCoverColors(fic(['Good Omens (TV)'], [], 'Two'));
    expect(a).toEqual(b);
    expect(BAND_COLORS).toContain(a.band);
    for (const c of Object.values(a)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    // Without a fandom, the title picks the colour.
    expect(BAND_COLORS).toContain(ficCoverColors(fic([], [], 'Untitled')).band);
  });

  it('mixes colours and sizes titles', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.3)).toBe('#102030');
    expect(titleScale('Ash')).toBe(1.25);
    expect(titleScale('The Long Way Home')).toBe(1);
    expect(titleScale('夜明けの手紙')).toBe(1); // six wide letters count as twelve
    expect(titleScale('An Unexpected Inheritance of Teacups, Ghosts, and Other Small Disasters')).toBe(0.7);
  });
});
