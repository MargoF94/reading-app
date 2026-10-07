// Reading time: totals, daily goal and streaks, reading speed and time left.
// Pure functions over ReadingTime records so they can be tested.
import { inPeriod, itemLength, type Period } from './stats';
import type { Item, ReadingTime, Settings } from './types';

/** "2 h 05 min", "45 min", "under a minute". */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

/** "1 h 48 m" — short, for tiles and charts. */
export function formatShort(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, '0')} m`;
}

export const total = (logs: ReadingTime[]): number => logs.reduce((s, t) => s + t.seconds, 0);

export function byDate(logs: ReadingTime[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of logs) m.set(t.date, (m.get(t.date) ?? 0) + t.seconds);
  return m;
}

const dayBefore = (date: string): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Days in a row that met the daily goal (or had any reading, without a goal).
 * Today still counts as "in progress": the streak runs up to yesterday until today's goal is met.
 */
export function streak(days: Map<string, number>, today: string, goalMinutes?: number): { current: number; best: number } {
  const met = (d: string) => (days.get(d) ?? 0) >= (goalMinutes ? goalMinutes * 60 : 1);
  let current = 0;
  let d = met(today) ? today : dayBefore(today);
  while (met(d)) {
    current++;
    d = dayBefore(d);
  }
  // Best: the longest run among all days that met it.
  const sorted = [...days.keys()].filter(met).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of sorted) {
    run = prev && dayBefore(day) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best: Math.max(best, current) };
}

/**
 * Seconds it takes to read the whole item, from reader sessions that moved
 * forward through it; undefined until there's enough to go on (10 minutes, 1%).
 */
export function secondsPerBook(logs: ReadingTime[]): number | undefined {
  let secs = 0;
  let moved = 0;
  for (const t of logs) {
    if (t.from === undefined || t.to === undefined || t.to <= t.from) continue;
    secs += t.seconds;
    moved += t.to - t.from;
  }
  return secs >= 600 && moved >= 0.01 ? secs / moved : undefined;
}

/** Seconds left from `fraction` to `end` (default: the end of the book). */
export function timeLeft(logs: ReadingTime[], fraction: number, end = 1): number | undefined {
  const per = secondsPerBook(logs);
  return per === undefined ? undefined : Math.max(0, end - fraction) * per;
}

export interface Speed {
  pagesPerHour?: number; // books and fics in other languages, as printed pages
  charsPerHour?: number; // Japanese
}

/** Reading speed from reader sessions over items whose length is known. */
export function readingSpeed(logs: ReadingTime[], itemOf: (id: string) => Item | undefined, s: Settings): Speed {
  let pages = 0;
  let pageSecs = 0;
  let chars = 0;
  let charSecs = 0;
  for (const t of logs) {
    if (t.from === undefined || t.to === undefined || t.to <= t.from) continue;
    const item = itemOf(t.itemId);
    if (!item) continue;
    const part = t.to - t.from;
    if (item.language === 'ja') {
      if (item.wordCount) {
        chars += part * item.wordCount;
        charSecs += t.seconds;
      }
      continue;
    }
    const len = itemLength(item, s);
    const p = len.pages ?? (len.words ? len.words / (s.wordsPerPage[item.language ?? 'en'] ?? s.wordsPerPage.en ?? 275) : 0);
    if (p) {
      pages += part * p;
      pageSecs += t.seconds;
    }
  }
  return {
    pagesPerHour: pageSecs >= 600 ? Math.round((pages / pageSecs) * 3600) : undefined,
    charsPerHour: charSecs >= 600 ? Math.round((chars / charSecs) * 3600 / 10) * 10 : undefined,
  };
}

export interface TimeStats {
  seconds: number;
  days: number; // days in the period (up to today)
  perDay: number; // average seconds per day
  longest?: ReadingTime;
  perItem: { itemId: string; seconds: number }[];
}

export function timeStats(logs: ReadingTime[], period: Period, today: string): TimeStats {
  const inP = logs.filter((t) => inPeriod(t.date, period));
  const seconds = total(inP);
  const first = period.from ?? inP.map((t) => t.date).sort()[0] ?? today;
  const last = period.to && period.to < today ? period.to : today;
  const days = Math.max(1, Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86400000) + 1);
  const per = new Map<string, number>();
  for (const t of inP) per.set(t.itemId, (per.get(t.itemId) ?? 0) + t.seconds);
  return {
    seconds,
    days,
    perDay: seconds / days,
    longest: inP.reduce<ReadingTime | undefined>((a, t) => (!a || t.seconds > a.seconds ? t : a), undefined),
    perItem: [...per].map(([itemId, s]) => ({ itemId, seconds: s })).sort((a, b) => b.seconds - a.seconds),
  };
}
