import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, dueReminders, durationLabel, endTime, googleCalendarUrl, isUnreleased, monthGrid, monthReleases,
  nextOccurrence, occurrences, occursOn, releaseLabel, releaseNotices, releases, toIcs, weekday,
} from '../src/lib/schedule';
import type { Item, ReadingSession } from '../src/lib/types';

const s = (extra: Partial<ReadingSession> = {}): ReadingSession => ({
  id: 's1', createdAt: '', updatedAt: '', itemId: 'i1', date: '2026-09-28', start: '07:30', minutes: 30, ...extra,
});
const book = (id: string, publicationDate?: string): Item => ({
  id, createdAt: '', updatedAt: '', type: 'book', title: id, authorIds: [], genreIds: [], tagIds: [], book: { publicationDate, purchases: [] },
});

describe('schedule dates', () => {
  it('works with Monday-first weeks', () => {
    expect(weekday('2026-09-28')).toBe(0); // Monday
    expect(weekday('2026-09-27')).toBe(6); // Sunday
    const grid = monthGrid('2026-09');
    expect(grid[0][0]).toBe('2026-08-31');
    expect(grid.at(-1)!.at(-1)).toBe('2026-10-04');
    expect(grid).toHaveLength(5);
    expect(monthGrid('2026-02')[0][0]).toBe('2026-01-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-27', '2026-10-03')).toBe(6);
  });

  it('formats times', () => {
    expect(endTime('23:30', 45)).toBe('00:15');
    expect(durationLabel(90)).toBe('1 h 30 min');
    expect(durationLabel(30)).toBe('30 min');
  });
});

describe('sessions', () => {
  it('repeats daily, on weekdays and weekly, minus skipped dates', () => {
    expect(occursOn(s(), '2026-09-28')).toBe(true);
    expect(occursOn(s(), '2026-09-29')).toBe(false);
    expect(occursOn(s({ repeat: 'daily' }), '2026-09-27')).toBe(false); // before the first date
    expect(occursOn(s({ repeat: 'weekdays' }), '2026-10-03')).toBe(false); // Saturday
    expect(occursOn(s({ repeat: 'weekdays' }), '2026-10-02')).toBe(true);
    expect(occursOn(s({ repeat: 'weekly' }), '2026-10-05')).toBe(true);
    expect(occursOn(s({ repeat: 'weekly', skipped: ['2026-10-05'] }), '2026-10-05')).toBe(false);
  });

  it('lists occurrences in time order and finds the next one', () => {
    const list = occurrences([s({ repeat: 'daily' }), s({ id: 's2', start: '06:00' })], '2026-09-28', '2026-09-29');
    expect(list.map((o) => o.key)).toEqual(['s2|2026-09-28', 's1|2026-09-28', 's1|2026-09-29']);
    const next = nextOccurrence(s({ repeat: 'weekly' }), new Date(2026, 8, 28, 9, 0));
    expect(next?.date).toBe('2026-10-05');
    expect(nextOccurrence(s(), new Date(2026, 8, 28, 7, 45))?.date).toBe('2026-09-28'); // still going
    expect(nextOccurrence(s(), new Date(2026, 8, 29))).toBeUndefined();
  });

  it('reminds once, from the reminder time until the session ends', () => {
    const occ = occurrences([s({ remind: 10 })], '2026-09-28', '2026-09-28');
    expect(dueReminders(occ, new Date(2026, 8, 28, 7, 19), new Set())).toHaveLength(0);
    expect(dueReminders(occ, new Date(2026, 8, 28, 7, 20), new Set())).toHaveLength(1);
    expect(dueReminders(occ, new Date(2026, 8, 28, 7, 20), new Set(['s1|2026-09-28']))).toHaveLength(0);
    expect(dueReminders(occ, new Date(2026, 8, 28, 8, 0), new Set())).toHaveLength(0);
    expect(dueReminders(occurrences([s()], '2026-09-28', '2026-09-28'), new Date(2026, 8, 28, 7, 30), new Set())).toHaveLength(0);
  });
});

describe('releases', () => {
  const items = [book('a', '2026-10-03'), book('b', '2026-09-28'), book('c', '2026-10'), book('d', '2026-09-20'), book('e', '2027')];
  it('finds books coming out', () => {
    expect(releases(items, '2026-09-27', '2026-10-31').map((r) => r.item.id)).toEqual(['b', 'a']);
    expect(monthReleases(items, '2026-10').map((r) => r.item.id)).toEqual(['c']);
    expect(isUnreleased(items[0], '2026-09-27')).toBe(true);
    expect(isUnreleased(items[2], '2026-09-27')).toBe(true);
    expect(isUnreleased(items[3], '2026-09-27')).toBe(false);
    expect(isUnreleased(items[4], '2026-09-27')).toBe(false); // year only: unknown
  });

  it('notices a week before and again the day before', () => {
    const n = releaseNotices(items, '2026-09-27', new Set());
    expect(n.map((x) => [x.item.id, x.days, x.key])).toEqual([
      ['b', 1, 'b|2026-09-28|day'],
      ['a', 6, 'a|2026-10-03|week'],
    ]);
    expect(releaseNotices(items, '2026-09-27', new Set(['a|2026-10-03|week'])).map((x) => x.item.id)).toEqual(['b']);
    // Dismissing the week notice doesn't hide the day-before one.
    expect(releaseNotices(items, '2026-10-02', new Set(['a|2026-10-03|week'])).map((x) => x.key)).toEqual(['a|2026-10-03|day']);
    expect(releaseNotices(items, '2026-09-25', new Set()).map((x) => x.item.id)).toEqual(['b']); // a is 8 days away
    expect([releaseLabel(0), releaseLabel(1), releaseLabel(6)]).toEqual(['Out today', 'Out tomorrow', 'Coming out in 6 days']);
  });
});

describe('calendar export', () => {
  it('writes an .ics event with repeat, skipped dates and alarm', () => {
    const ics = toIcs(s({ repeat: 'weekly', remind: 10, skipped: ['2026-10-05'], note: 'Part 3; chapters 1,2' }), 'Piranesi', 'https://x/#/item/i1', new Date(Date.UTC(2026, 8, 27, 12)));
    const lines = ics.split('\r\n');
    expect(lines).toContain('DTSTART:20260928T073000');
    expect(lines).toContain('DTEND:20260928T080000');
    expect(lines).toContain('RRULE:FREQ=WEEKLY');
    expect(lines).toContain('EXDATE:20261005T073000');
    expect(lines).toContain('TRIGGER:-PT10M');
    expect(lines).toContain('SUMMARY:Read: Piranesi');
    expect(lines).toContain('DTSTAMP:20260927T120000Z');
    expect(ics.replace(/\r\n /g, '')).toContain(String.raw`DESCRIPTION:Part 3\; chapters 1\,2\nhttps://x/#/item/i1`);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folds long lines and handles sessions past midnight', () => {
    const long = 'Ж'.repeat(60);
    const ics = toIcs(s({ start: '23:30', minutes: 60 }), long, 'https://x');
    expect(ics).toContain('DTEND:20260929T003000');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:Read: ${long}`);
  });

  it('builds a Google Calendar link', () => {
    const u = new URL(googleCalendarUrl(s({ repeat: 'weekdays' }), 'Piranesi', 'https://x'));
    expect(u.searchParams.get('dates')).toBe('20260928T073000/20260928T080000');
    expect(u.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(u.searchParams.get('text')).toBe('Read: Piranesi');
  });
});

describe('reading history on the calendar', () => {
  it('lists starts, finishes, DNFs and purchases in range', async () => {
    const { historyEvents } = await import('../src/lib/schedule');
    const items = [
      book('a'),
      { ...book('b'), book: { purchases: [{ id: 'p', date: '2026-09-10', price: 1200, currency: 'JPY' as const, source: 'bought' as const }, { id: 'q', currency: 'USD' as const, source: 'gift' as const }] } },
    ];
    const r = (id: string, extra: object) => ({ id, createdAt: '', updatedAt: '', itemId: 'a', unit: 'pages' as const, log: [], ...extra });
    const readings = [
      r('r1', { outcome: 'finished', startDate: '2026-09-01', finishDate: '2026-09-12' }),
      r('r2', { outcome: 'dnf', startDate: '2026-08-20', finishDate: '2026-09-03' }),
      r('r3', { outcome: 'reading', startDate: '2026-09-20' }),
      r('r4', { outcome: 'finished', finishDate: '2026-09-15', deleted: true }),
      r('r5', { outcome: 'finished', finishDate: '2026' }),
      { ...r('r6', { outcome: 'finished', finishDate: '2026-09-05' }), itemId: 'gone' },
    ] as never;
    const ev = historyEvents(items, readings, '2026-09-01', '2026-09-30');
    expect(ev.map((e) => `${e.date} ${e.kind} ${e.item.id}`)).toEqual([
      '2026-09-01 started a',
      '2026-09-03 dnf a',
      '2026-09-10 bought b',
      '2026-09-12 finished a',
      '2026-09-20 started a',
    ]);
  });
});
