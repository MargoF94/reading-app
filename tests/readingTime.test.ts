import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/lib/constants';
import { byDate, formatDuration, readingSpeed, secondsPerBook, streak, timeLeft, timeStats } from '../src/lib/readingTime';
import type { Item, ReadingTime } from '../src/lib/types';

let n = 0;
const t = (date: string, minutes: number, extra: Partial<ReadingTime> = {}): ReadingTime => ({
  id: String(++n), createdAt: 'a', updatedAt: 'a', itemId: 'b', date, seconds: minutes * 60, source: 'reader', ...extra,
});

describe('reading time', () => {
  it('formats durations', () => {
    expect(formatDuration(20)).toBe('under a minute');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(125 * 60)).toBe('2 h 05 min');
    expect(formatDuration(120 * 60)).toBe('2 h');
  });

  it('counts streaks against the daily goal, with today still open', () => {
    const days = byDate([t('2026-10-03', 40), t('2026-10-04', 10), t('2026-10-05', 35), t('2026-10-06', 31), t('2026-10-07', 5)]);
    // Goal 30: Oct 5–6 met; today (7th) not yet, so the streak is 2 and stays alive.
    expect(streak(days, '2026-10-07', 30)).toEqual({ current: 2, best: 2 });
    // No goal: any reading counts.
    expect(streak(days, '2026-10-07')).toEqual({ current: 5, best: 5 });
    // A missed day breaks it.
    expect(streak(days, '2026-10-09', 30).current).toBe(0);
  });

  it('estimates time left from reader sessions that moved forward', () => {
    const logs = [t('2026-10-05', 30, { from: 0, to: 0.1 }), t('2026-10-06', 30, { from: 0.1, to: 0.2 }), t('2026-10-06', 20, { source: 'timer' })];
    expect(secondsPerBook(logs)).toBeCloseTo(300 * 60);
    expect(timeLeft(logs, 0.2)! / 60).toBeCloseTo(240);
    expect(secondsPerBook([t('2026-10-05', 5, { from: 0, to: 0.1 })])).toBeUndefined();
  });

  it('works out reading speed in pages, and characters for Japanese', () => {
    const items: Record<string, Item> = {
      b: { id: 'b', type: 'book', title: 'x', language: 'en', authorIds: [], genreIds: [], tagIds: [], book: { pageCount: 300, purchases: [] } } as unknown as Item,
      j: { id: 'j', type: 'book', title: 'y', language: 'ja', wordCount: 100000, authorIds: [], genreIds: [], tagIds: [] } as unknown as Item,
    };
    const logs = [t('2026-10-05', 60, { from: 0, to: 0.1 }), t('2026-10-05', 60, { itemId: 'j', from: 0, to: 0.02 })];
    expect(readingSpeed(logs, (id) => items[id], defaultSettings('x'))).toEqual({ pagesPerHour: 30, charsPerHour: 2000 });
  });

  it('sums a period', () => {
    const s = timeStats([t('2026-10-01', 30), t('2026-10-02', 90, { itemId: 'c' }), t('2026-09-30', 50)], { from: '2026-10-01', to: '2026-10-31' }, '2026-10-04');
    expect(s.seconds).toBe(120 * 60);
    expect(s.days).toBe(4);
    expect(s.perDay).toBe(30 * 60);
    expect(s.perItem[0]).toEqual({ itemId: 'c', seconds: 90 * 60 });
    expect(s.longest?.seconds).toBe(90 * 60);
  });
});
