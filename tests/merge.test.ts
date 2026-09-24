import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../src/lib/github';
import {
  emptyCollections,
  mergeCollections,
  mergeRecords,
  parseLibraryFile,
  sameContent,
  stableStringify,
  toLibraryFile,
} from '../src/lib/merge';
import type { NamedRecord } from '../src/lib/types';

const rec = (id: string, name: string, updatedAt: string, deleted?: boolean): NamedRecord => ({
  id,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  ...(deleted ? { deleted } : {}),
});

describe('mergeRecords', () => {
  it('keeps the newest version of each record', () => {
    const local = [rec('a', 'Local A', '2026-02-01'), rec('b', 'Only local', '2026-01-01')];
    const remote = [rec('a', 'Remote A', '2026-01-15'), rec('c', 'Only remote', '2026-01-01')];
    const merged = mergeRecords(local, remote);
    expect(merged.map((r) => r.name)).toEqual(['Local A', 'Only local', 'Only remote']);
  });

  it('lets a newer deletion win over an older edit', () => {
    const merged = mergeRecords([rec('a', 'Edited', '2026-01-02')], [rec('a', 'Edited', '2026-01-03', true)]);
    expect(merged[0].deleted).toBe(true);
  });

  it('is symmetric', () => {
    const a = [rec('x', '1', '2026-01-01'), rec('y', '2', '2026-03-01')];
    const b = [rec('x', '3', '2026-02-01'), rec('y', '4', '2026-01-01')];
    expect(mergeRecords(a, b)).toEqual(mergeRecords(b, a));
  });
});

describe('library file', () => {
  it('round-trips through JSON with stable key order', () => {
    const c = emptyCollections();
    c.genres = [rec('g1', 'Fantasy', '2026-01-01')];
    const text = stableStringify(toLibraryFile(c, '2026-09-24T00:00:00.000Z'));
    expect(text.indexOf('"app"')).toBeLessThan(text.indexOf('"genres"'));
    const back = parseLibraryFile(text);
    expect(sameContent(back, c)).toBe(true);
  });

  it('rejects unrelated JSON', () => {
    expect(() => parseLibraryFile('{"hello": 1}')).toThrow();
  });

  it('detects content differences', () => {
    const a = emptyCollections();
    const b = mergeCollections(a, { ...emptyCollections(), tags: [rec('t', 'x', '2026-01-01')] });
    expect(sameContent(a, b)).toBe(false);
  });
});

describe('base64', () => {
  it('handles English, Russian and Japanese text', () => {
    const text = 'Master and Margarita / Мастер и Маргарита / 巨匠とマルガリータ';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });
});
