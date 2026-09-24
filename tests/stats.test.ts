import { describe, expect, it } from 'vitest';
import { seriesRows } from '../src/lib/browse';
import { defaultSettings } from '../src/lib/constants';
import { emptyCollections } from '../src/lib/merge';
import { computeStats, goalPace, itemLength, presetPeriod, readingPortions } from '../src/lib/stats';
import type { Item, Reading } from '../src/lib/types';

const now = '2026-01-01T00:00:00.000Z';
const settings = defaultSettings(now);

function book(id: string, fields: Partial<Item> = {}, bookFields: Partial<NonNullable<Item['book']>> = {}): Item {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    type: 'book',
    title: id,
    authorIds: [],
    genreIds: [],
    tagIds: [],
    language: 'en',
    ...fields,
    book: { purchases: [], ...bookFields },
  };
}

function fic(id: string, words: number, fields: Partial<Item> = {}): Item {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    type: 'fic',
    title: id,
    authorIds: [],
    genreIds: [],
    tagIds: [],
    wordCount: words,
    language: 'en',
    ...fields,
    fic: { site: 'ao3', warnings: [], categories: [], fandoms: ['F'], relationships: [], characters: [], additionalTags: [], complete: true, chaptersAvailable: 10, chaptersTotal: 10 },
  };
}

function reading(itemId: string, fields: Partial<Reading>): Reading {
  return { id: itemId + (fields.finishDate ?? fields.startDate ?? ''), createdAt: now, updatedAt: now, itemId, outcome: 'finished', unit: 'pages', log: [], ...fields };
}

describe('lengths', () => {
  it('estimates words from pages by language', () => {
    expect(itemLength(book('a', {}, { pageCount: 100 }), settings)).toMatchObject({ pages: 100, words: 27500, wordsEstimated: true });
    expect(itemLength(book('r', { language: 'ru' }, { pageCount: 100 }), settings).words).toBe(25000);
  });

  it('converts Japanese characters and handles audiobooks and manga', () => {
    expect(itemLength(fic('j', 25000, { language: 'ja' }), settings)).toMatchObject({ words: 10000, wordsEstimated: true });
    expect(itemLength(fic('e', 25000), settings)).toMatchObject({ words: 25000, wordsEstimated: false });
    expect(itemLength(book('au', {}, { format: 'audiobook', durationMinutes: 120 }), settings)).toMatchObject({ words: 18000, minutes: 120 });
    expect(itemLength(book('m', {}, { format: 'manga', pageCount: 200 }), settings)).toMatchObject({ pages: 200 });
    expect(itemLength(book('m', {}, { format: 'manga', pageCount: 200 }), settings).words).toBeUndefined();
    expect(itemLength(book('m', {}, { format: 'manga', pageCount: 200 }), { ...settings, mangaCountsWords: true }).words).toBe(55000);
  });
});

describe('attribution', () => {
  const b = book('b', {}, { pageCount: 400 });

  it('splits a read across the days in the progress log', () => {
    const r = reading('b', {
      startDate: '2025-12-20',
      finishDate: '2026-01-10',
      log: [{ id: '1', date: '2025-12-31', value: 100, unit: 'pages' }],
    });
    expect(readingPortions(b, r)).toEqual([
      { date: '2025-12-31', fraction: 0.25 },
      { date: '2026-01-10', fraction: 0.75 },
    ]);
  });

  it('counts only what was read for a DNF', () => {
    const r = reading('b', { outcome: 'dnf', finishDate: '2026-02-01', log: [{ id: '1', date: '2026-01-20', value: 50, unit: 'percent' }] });
    expect(readingPortions(b, r)).toEqual([{ date: '2026-01-20', fraction: 0.5 }]);
  });
});

describe('computeStats', () => {
  const data = emptyCollections();
  data.genres = [{ id: 'g1', name: 'Horror', createdAt: now, updatedAt: now }];
  data.items = [
    book('b1', { genreIds: ['g1'], rating: 4 }, { pageCount: 400, purchases: [{ id: 'p', date: '2026-02-01', price: 1500, currency: 'JPY', source: 'bought', fx: { date: '2026-02-01', perUsd: { USD: 1, JPY: 150 } } }] }),
    book('b2', { rating: 5 }, { pageCount: 100 }),
    fic('f1', 50000, { language: 'en' }),
    book('old', {}, { pageCount: 300 }),
  ];
  data.readings = [
    reading('b1', { startDate: '2025-12-20', finishDate: '2026-01-10', log: [{ id: '1', date: '2025-12-31', value: 100, unit: 'pages' }] }),
    reading('b2', { startDate: '2026-03-01', finishDate: '2026-03-05' }),
    reading('f1', { finishDate: '2026-03-20' }),
    reading('old', {}), // imported without dates
  ];

  it('totals a year using the progress log', () => {
    const s = computeStats(data, settings, { period: presetPeriod('this-year', '2026-06-15'), today: '2026-06-15' });
    expect(s.finishedBooks).toBe(2);
    expect(s.finishedFics).toBe(1);
    expect(s.pages).toBe(300 + 100); // 3/4 of b1 in 2026, all of b2
    expect(Math.round(s.words)).toBe(Math.round(300 * 275 + 100 * 275 + 50000));
    expect(s.monthly).toBe(true);
    expect(s.buckets).toHaveLength(12);
    expect(s.buckets[0]).toMatchObject({ key: '2026-01', books: 1, pages: 300 });
    expect(s.buckets[2]).toMatchObject({ key: '2026-03', books: 1, fics: 1 });
    expect(s.genres).toEqual([{ name: 'Horror', count: 1 }]);
    expect(s.avgRating).toBe(4.5);
    expect(s.spent.total).toBe(10);
    expect(s.buckets[1].spent).toBe(10);
    expect(s.avgDays).toBe((22 + 5) / 2);
    expect(s.undatedFinished).toBe(0);
  });

  it('includes undated reads only in all time', () => {
    const s = computeStats(data, settings, { period: {}, today: '2026-06-15' });
    expect(s.finishedBooks).toBe(3);
    expect(s.undatedFinished).toBe(1);
    expect(s.pages).toBe(400 + 100 + 300);
  });

  it('filters by type', () => {
    const s = computeStats(data, settings, { period: presetPeriod('this-year', '2026-06-15'), type: 'fic', today: '2026-06-15' });
    expect(s.finishedBooks).toBe(0);
    expect(s.finishedFics).toBe(1);
    expect(s.fandoms).toEqual([{ name: 'F', count: 1 }]);
  });
});

describe('periods and goals', () => {
  it('builds presets', () => {
    expect(presetPeriod('last-12', '2026-09-24')).toEqual({ from: '2025-10-01', to: '2026-09-30' });
    expect(presetPeriod('this-month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetPeriod('all', '2026-02-10')).toEqual({});
  });

  it('computes goal pace', () => {
    const half = goalPace(50, 30, 2026, '2026-07-02'); // day 183 of 365
    expect(Math.round(half.expected)).toBe(25);
    expect(half.ahead).toBeGreaterThan(4);
    expect(goalPace(50, 40, 2025, '2026-01-05')).toEqual({ expected: 50, ahead: -10 });
  });
});

describe('series order', () => {
  it('shows gaps up to the series length', () => {
    const items = [book('one', { seriesNumber: '1' }), book('three', { seriesNumber: '3' }), book('half', { seriesNumber: '1.5' }), book('x')];
    const rows = seriesRows(items, 4).map((r) => (r.item ? r.item.id : `gap${r.position}`));
    expect(rows).toEqual(['one', 'half', 'gap2', 'three', 'gap4', 'x']);
  });
});
