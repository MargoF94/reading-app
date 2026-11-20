import { describe, expect, it } from 'vitest';
import { seriesRows } from '../src/lib/browse';
import { inSeries, lengthSummary, numberIn, seriesFields, seriesLength, seriesOf, withoutSeries } from '../src/lib/series';
import type { Item } from '../src/lib/types';

const t = '2026-01-01T00:00:00.000Z';
const item = (id: string, fields: Partial<Item> = {}): Item => ({
  id,
  createdAt: t,
  updatedAt: t,
  type: 'book',
  title: id,
  authorIds: [],
  genreIds: [],
  tagIds: [],
  ...fields,
});

describe('several series', () => {
  const both = item('b', {
    seriesId: 'main',
    seriesNumber: '2',
    moreSeries: [{ id: 'world', number: '5' }, { id: 'main', number: '9' }, { id: 'loose' }],
  });

  it('lists every series, the main one first', () => {
    expect(seriesOf(both)).toEqual([{ id: 'main', number: '2' }, { id: 'world', number: '5' }, { id: 'loose' }]);
    expect(seriesOf(item('x'))).toEqual([]);
    expect(seriesOf(item('y', { seriesId: 's' }))).toEqual([{ id: 's', number: undefined }]);
    expect(inSeries(both, 'world')).toBe(true);
    expect(inSeries(both, 'other')).toBe(false);
    expect(numberIn(both, 'main')).toBe('2');
    expect(numberIn(both, 'world')).toBe('5');
    expect(numberIn(both, 'loose')).toBeUndefined();
  });

  it('saves the first series as the main one, without repeats or blanks', () => {
    expect(seriesFields([{ id: 'a', number: ' 1 ' }, { id: '' }, { id: 'b', number: '' }, { id: 'a', number: '7' }])).toEqual({
      seriesId: 'a',
      seriesNumber: '1',
      moreSeries: [{ id: 'b' }],
    });
    expect(seriesFields([{ id: 'a' }])).toEqual({ seriesId: 'a', seriesNumber: undefined, moreSeries: undefined });
    expect(seriesFields([])).toEqual({ seriesId: undefined, seriesNumber: undefined, moreSeries: undefined });
  });

  it('takes an item out of a series, and its next series becomes the main one', () => {
    const out = withoutSeries(both, 'main');
    expect(out.seriesId).toBe('world');
    expect(out.seriesNumber).toBe('5');
    expect(seriesOf(out)).toEqual([{ id: 'world', number: '5' }, { id: 'loose' }]);
    expect(out.title).toBe('b');
    expect(seriesOf(withoutSeries(out, 'loose'))).toEqual([{ id: 'world', number: '5' }]);
    expect(withoutSeries(item('x', { seriesId: 's', seriesNumber: '1' }), 's')).toMatchObject({
      seriesId: undefined,
      seriesNumber: undefined,
      moreSeries: undefined,
    });
  });

  it('orders a series by the numbers in that series', () => {
    const a = item('a', { seriesId: 'one', seriesNumber: '1', moreSeries: [{ id: 'two', number: '3' }] });
    const b = item('b', { seriesId: 'two', seriesNumber: '1' });
    const c = item('c', { seriesId: 'three', moreSeries: [{ id: 'two', number: '2' }] });
    const rows = seriesRows([a, b, c], undefined, (i) => numberIn(i, 'two'));
    expect(rows.map((r) => [r.position, r.item?.id])).toEqual([
      [1, 'b'],
      [2, 'c'],
      [3, 'a'],
    ]);
  });
});

describe('length of a series', () => {
  it('adds up the pages of books and manga and the words of fics', () => {
    const items = [
      item('b1', { book: { pageCount: 320, purchases: [] } }),
      item('b2', { book: { pageCount: 0, purchases: [] } }),
      item('m1', { type: 'manga', book: { pageCount: 192, purchases: [] } }),
      item('m2', { type: 'manga' }),
      item('f1', { type: 'fic', wordCount: 12000 }),
      item('f2', { type: 'fic' }),
      item('a1', { book: { format: 'audiobook', durationMinutes: 600, purchases: [] } }),
    ];
    const l = seriesLength(items);
    expect(l).toEqual({ pages: 512, pagedBooks: 1, pagedManga: 1, noPages: 3, words: 12000, countedFics: 1, noWords: 1 });
    expect(lengthSummary(l)).toBe('512 pages · 12,000 words');
    expect(lengthSummary(seriesLength([items[0]]))).toBe('320 pages');
    expect(lengthSummary(seriesLength([items[4], item('f3', { type: 'fic', wordCount: 1 })]))).toBe('12,001 words');
    expect(lengthSummary(seriesLength([items[1], items[5]]))).toBe('');
  });
});
