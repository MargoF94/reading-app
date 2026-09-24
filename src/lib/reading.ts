// Pure logic for statuses, read-throughs and progress. No storage access here.
import type { Item, ProgressEntry, ProgressUnit, Reading, Status } from './types';
import { newId } from './util';

export function readingSortKey(r: Reading): string {
  return (r.startDate || r.finishDate || r.createdAt.slice(0, 10)) + '|' + r.createdAt;
}

/** Oldest first. */
export function sortReadings(readings: Reading[]): Reading[] {
  return readings.filter((r) => !r.deleted).sort((a, b) => (readingSortKey(a) < readingSortKey(b) ? -1 : 1));
}

export function isActive(r: Reading): boolean {
  return r.outcome === 'reading' || r.outcome === 'on-hold';
}

export function activeReading(readings: Reading[]): Reading | undefined {
  return sortReadings(readings).filter(isActive).at(-1);
}

export function deriveStatus(readings: Reading[]): Status {
  const sorted = sortReadings(readings);
  const active = sorted.filter(isActive).at(-1);
  if (active) return active.outcome === 'on-hold' ? 'on-hold' : 'currently-reading';
  const last = sorted.at(-1);
  if (!last) return 'want-to-read';
  return last.outcome === 'dnf' ? 'dnf' : 'read';
}

export function finishedReadings(readings: Reading[]): Reading[] {
  return sortReadings(readings).filter((r) => r.outcome === 'finished');
}

export function latestEntry(r: Reading | undefined): ProgressEntry | undefined {
  if (!r || r.log.length === 0) return undefined;
  // Log is kept in insertion order; ties on date keep the later insertion.
  let best = r.log[0];
  for (const e of r.log) if (e.date >= best.date) best = e;
  return best;
}

export function unitsFor(item: Item): ProgressUnit[] {
  if (item.type === 'fic') return ['chapters', 'percent'];
  if (item.book?.format === 'audiobook') return ['percent', 'minutes'];
  return ['pages', 'percent'];
}

export function defaultUnit(item: Item): ProgressUnit {
  return unitsFor(item)[0];
}

/** Total for a unit, if known (pages, chapters, minutes). */
export function unitTotal(item: Item, unit: ProgressUnit): number | undefined {
  switch (unit) {
    case 'percent':
      return 100;
    case 'pages':
      return item.book?.pageCount;
    case 'chapters':
      return item.fic?.chaptersTotal ?? item.fic?.chaptersAvailable;
    case 'minutes':
      return item.book?.durationMinutes;
  }
}

/** 0..100, or undefined if the total is unknown. */
export function entryPercent(item: Item, entry: ProgressEntry | undefined): number | undefined {
  if (!entry) return undefined;
  const total = unitTotal(item, entry.unit);
  if (!total) return undefined;
  return Math.max(0, Math.min(100, (entry.value / total) * 100));
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Human label such as "p. 120 of 350", "ch. 3 of ?", "45%", "3h 20m of 10h 5m". */
export function entryLabel(item: Item, entry: ProgressEntry): string {
  const total = entry.unit === 'percent' ? undefined : unitTotal(item, entry.unit);
  switch (entry.unit) {
    case 'percent':
      return `${round(entry.value)}%`;
    case 'pages':
      return `p. ${entry.value}${total ? ` of ${total}` : ''}`;
    case 'chapters': {
      const t = item.fic?.chaptersTotal;
      return `ch. ${entry.value} of ${t ?? '?'}`;
    }
    case 'minutes':
      return `${formatMinutes(entry.value)}${total ? ` of ${formatMinutes(total)}` : ''}`;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Whether a progress value means the item is done. */
export function isComplete(item: Item, entry: ProgressEntry): boolean {
  if (entry.unit === 'percent') return entry.value >= 100;
  if (entry.unit === 'chapters') {
    return item.fic?.chaptersTotal !== undefined && entry.value >= item.fic.chaptersTotal;
  }
  const total = unitTotal(item, entry.unit);
  return total !== undefined && entry.value >= total;
}

export interface ReadingChanges {
  upsert: Reading[];
  remove: Reading[];
}

export function newReading(item: Item, now: string, fields: Partial<Reading>): Reading {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    itemId: item.id,
    outcome: 'reading',
    unit: defaultUnit(item),
    log: [],
    format: item.book?.format,
    ...fields,
  };
}

/**
 * Changes to the item's read-throughs needed to reach `target`.
 * `date` is the local day used for start / finish dates.
 */
export function transition(
  item: Item,
  readings: Reading[],
  target: Status,
  date: string,
  now: string,
): ReadingChanges {
  const sorted = sortReadings(readings);
  const active = sorted.filter(isActive).at(-1);
  const update = (r: Reading, fields: Partial<Reading>): ReadingChanges => ({
    upsert: [{ ...r, ...fields, updatedAt: now }],
    remove: [],
  });
  const create = (fields: Partial<Reading>): ReadingChanges => ({
    upsert: [newReading(item, now, fields)],
    remove: [],
  });

  switch (target) {
    case 'currently-reading':
      if (active) return active.outcome === 'reading' ? none() : update(active, { outcome: 'reading' });
      return create({ startDate: date, outcome: 'reading' });
    case 'on-hold':
      if (active) return active.outcome === 'on-hold' ? none() : update(active, { outcome: 'on-hold' });
      return create({ startDate: date, outcome: 'on-hold' });
    case 'read':
      if (active) return update(active, { outcome: 'finished', finishDate: date });
      return create({ finishDate: date, outcome: 'finished' });
    case 'dnf':
      if (active) return update(active, { outcome: 'dnf', finishDate: date });
      return create({ finishDate: date, outcome: 'dnf' });
    case 'want-to-read': {
      // Undo: drop the current read-through, or the latest one if nothing is active.
      const victim = active ?? sorted.at(-1);
      return victim ? { upsert: [], remove: [victim] } : none();
    }
  }
}

function none(): ReadingChanges {
  return { upsert: [], remove: [] };
}

/** The read-through `want-to-read` would remove, so the UI can confirm first. */
export function readingRemovedByUndo(readings: Reading[]): Reading | undefined {
  const sorted = sortReadings(readings);
  return sorted.filter(isActive).at(-1) ?? sorted.at(-1);
}

export function lastFinishDate(readings: Reading[]): string | undefined {
  return sortReadings(readings)
    .map((r) => r.finishDate)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
}
