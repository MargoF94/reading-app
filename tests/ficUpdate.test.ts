import { describe, expect, it } from 'vitest';
import { ficUpdateFromDraft } from '../src/lib/ficUpdate';
import type { Item } from '../src/lib/types';

const fic = {
  id: 'f', createdAt: 'a', updatedAt: 'a', type: 'fic', title: 'Kostio', authorIds: [], genreIds: [], tagIds: [], wordCount: 98410,
  fic: { site: 'ao3', warnings: [], categories: [], fandoms: [], relationships: [], characters: [], additionalTags: [], complete: false, chaptersAvailable: 21, chaptersTotal: 30 },
} as Item;

describe('newer fic EPUB', () => {
  it('lists chapter, word and status changes and the fields to update', () => {
    const { changes, patch } = ficUpdateFromDraft(fic, {
      type: 'fic',
      wordCount: 112950,
      fic: { chaptersAvailable: 24, chaptersTotal: 30, complete: false, updatedDate: '2026-10-01' },
    });
    expect(changes).toEqual([
      { label: 'Chapters', from: '21/30', to: '24/30' },
      { label: 'Words', from: '98,410', to: '112,950' },
    ]);
    expect(patch.fic).toMatchObject({ chaptersAvailable: 24, updatedDate: '2026-10-01', fandoms: [] });
    expect(patch.wordCount).toBe(112950);
  });

  it('notices a fic being finished, and nothing for the same file', () => {
    const done = ficUpdateFromDraft(fic, { type: 'fic', fic: { chaptersAvailable: 30, chaptersTotal: 30, complete: true } });
    expect(done.changes.map((c) => c.label)).toEqual(['Chapters', 'Status']);
    expect(ficUpdateFromDraft(fic, { type: 'fic', wordCount: 98410, fic: { chaptersAvailable: 21 } }).changes).toEqual([]);
  });
});
