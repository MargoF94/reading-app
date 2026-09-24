import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  entryLabel,
  entryPercent,
  isComplete,
  readingRemovedByUndo,
  transition,
} from '../src/lib/reading';
import type { Item, Reading } from '../src/lib/types';

const now = '2026-09-24T10:00:00.000Z';

const book: Item = {
  id: 'b1',
  createdAt: now,
  updatedAt: now,
  type: 'book',
  title: 'Book',
  authorIds: [],
  genreIds: [],
  tagIds: [],
  book: { pageCount: 300, purchases: [] },
};

const fic: Item = {
  ...book,
  id: 'f1',
  type: 'fic',
  book: undefined,
  fic: {
    site: 'ao3',
    warnings: [],
    categories: [],
    fandoms: [],
    relationships: [],
    characters: [],
    additionalTags: [],
    complete: false,
    chaptersAvailable: 3,
  },
};

function apply(readings: Reading[], changes: { upsert: Reading[]; remove: Reading[] }): Reading[] {
  const removed = new Set(changes.remove.map((r) => r.id));
  const up = new Map(changes.upsert.map((r) => [r.id, r]));
  const kept = readings.filter((r) => !removed.has(r.id)).map((r) => up.get(r.id) ?? r);
  for (const r of changes.upsert) if (!readings.some((x) => x.id === r.id)) kept.push(r);
  return kept;
}

describe('status flow', () => {
  it('starts as want to read', () => {
    expect(deriveStatus([])).toBe('want-to-read');
  });

  it('goes reading → on hold → reading → read', () => {
    let rs: Reading[] = [];
    rs = apply(rs, transition(book, rs, 'currently-reading', '2026-09-01', now));
    expect(deriveStatus(rs)).toBe('currently-reading');
    expect(rs[0].startDate).toBe('2026-09-01');

    rs = apply(rs, transition(book, rs, 'on-hold', '2026-09-05', now));
    expect(deriveStatus(rs)).toBe('on-hold');

    rs = apply(rs, transition(book, rs, 'currently-reading', '2026-09-10', now));
    expect(rs).toHaveLength(1);

    rs = apply(rs, transition(book, rs, 'read', '2026-09-20', now));
    expect(deriveStatus(rs)).toBe('read');
    expect(rs[0].finishDate).toBe('2026-09-20');
  });

  it('supports re-reads as separate read-throughs', () => {
    let rs: Reading[] = [];
    rs = apply(rs, transition(book, rs, 'read', '2025-01-01', now));
    rs = apply(rs, transition(book, rs, 'currently-reading', '2026-09-01', '2026-09-01T00:00:00.000Z'));
    expect(rs).toHaveLength(2);
    expect(deriveStatus(rs)).toBe('currently-reading');
    rs = apply(rs, transition(book, rs, 'dnf', '2026-09-10', now));
    expect(deriveStatus(rs)).toBe('dnf');
  });

  it('moving back to want to read removes the active read-through', () => {
    let rs: Reading[] = [];
    rs = apply(rs, transition(book, rs, 'currently-reading', '2026-09-01', now));
    expect(readingRemovedByUndo(rs)?.id).toBe(rs[0].id);
    rs = apply(rs, transition(book, rs, 'want-to-read', '2026-09-02', now));
    expect(deriveStatus(rs)).toBe('want-to-read');
  });
});

describe('progress', () => {
  it('computes percent from pages and chapters', () => {
    expect(entryPercent(book, { id: 'e', date: '2026-09-01', value: 150, unit: 'pages' })).toBe(50);
    // WIP fic without a total uses chapters posted
    expect(entryPercent(fic, { id: 'e', date: '2026-09-01', value: 3, unit: 'chapters' })).toBe(100);
    expect(entryLabel(fic, { id: 'e', date: '2026-09-01', value: 2, unit: 'chapters' })).toBe('ch. 2 of ?');
  });

  it('only treats a WIP as complete when the total is known', () => {
    expect(isComplete(fic, { id: 'e', date: '2026-09-01', value: 3, unit: 'chapters' })).toBe(false);
    expect(isComplete(book, { id: 'e', date: '2026-09-01', value: 300, unit: 'pages' })).toBe(true);
  });
});

describe('ordering', () => {
  it('treats undated read-throughs as older than dated ones', () => {
    const base = { itemId: 'b1', unit: 'pages' as const, log: [] };
    const undated: Reading = { ...base, id: 'u', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: now, outcome: 'finished' };
    const dnf: Reading = { ...base, id: 'd', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: now, outcome: 'dnf', finishDate: '2022-09-15' };
    expect(deriveStatus([dnf, undated])).toBe('dnf');
    expect(deriveStatus([undated, dnf])).toBe('dnf');
  });
});
