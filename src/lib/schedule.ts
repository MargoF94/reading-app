// Reading calendar: planned sessions (with repeats), book release dates,
// release notices for Home, reminders and export to phone calendars.
// Dates are "YYYY-MM-DD" and times "HH:MM" in the reader's local time.
import type { Item, ReadingSession, Repeat } from './types';
import { toDateString } from './util';

// ---- dates ------------------------------------------------------------------------

const utc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(utc(date)).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekday(date));
}

/** The 5 or 6 Monday-first weeks that show a month, as dates. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = startOfWeek(first);
  const next = addMonths(month, 1) + '-01';
  const weeks: string[][] = [];
  for (let d = start; d < next || weeks.length === 0; ) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(d, i));
    weeks.push(week);
    d = addDays(d, 7);
  }
  return weeks;
}

export function addMonths(month: string, n: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function isFullDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ---- times --------------------------------------------------------------------------

/** "07:30" + 45 → "08:15" (wraps past midnight). */
export function endTime(start: string, minutes: number): string {
  const total = (toMinutes(start) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const toMinutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

/** Local Date for a date + time. */
export function at(date: string, time: string): Date {
  return new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5));
}

// ---- sessions ---------------------------------------------------------------------------

export const REPEAT_LABEL: Record<Repeat, string> = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every week' };

export function occursOn(s: ReadingSession, date: string): boolean {
  if (date < s.date || s.skipped?.includes(date)) return false;
  switch (s.repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday(date) < 5;
    case 'weekly':
      return weekday(date) === weekday(s.date);
    default:
      return date === s.date;
  }
}

export interface Occurrence {
  session: ReadingSession;
  date: string;
  key: string; // session id + date
  startAt: Date;
  endAt: Date;
}

/** Every session occurrence between two dates (inclusive), in time order. */
export function occurrences(sessions: ReadingSession[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of sessions) {
      if (!occursOn(s, d)) continue;
      const startAt = at(d, s.start);
      out.push({ session: s, date: d, key: `${s.id}|${d}`, startAt, endAt: new Date(startAt.getTime() + s.minutes * 60_000) });
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Next occurrence at or after `now` (ongoing ones count). */
export function nextOccurrence(s: ReadingSession, now: Date, horizonDays = 400): Occurrence | undefined {
  const today = toDateString(now);
  return occurrences([s], today, addDays(today, horizonDays)).find((o) => o.endAt > now);
}

/** Reminders that should show now and haven't been shown yet. */
export function dueReminders(occs: Occurrence[], now: Date, shown: Set<string>): Occurrence[] {
  return occs.filter((o) => {
    if (o.session.remind === undefined || shown.has(o.key)) return false;
    return now.getTime() >= o.startAt.getTime() - o.session.remind * 60_000 && now < o.endAt;
  });
}

// ---- releases -----------------------------------------------------------------------------

export interface Release {
  item: Item;
  date: string; // YYYY-MM-DD, or YYYY-MM when only the month is known
}

/** Books coming out on a known day between two dates. */
export function releases(items: Item[], from: string, to: string): Release[] {
  return items
    .filter((i) => i.type === 'book' && isFullDate(i.book?.publicationDate) && i.book!.publicationDate! >= from && i.book!.publicationDate! <= to)
    .map((item) => ({ item, date: item.book!.publicationDate! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Books coming out some time in a month (only the month is known). */
export function monthReleases(items: Item[], month: string): Release[] {
  return items.filter((i) => i.type === 'book' && i.book?.publicationDate === month).map((item) => ({ item, date: month }));
}

/** Not out yet, as of today. */
export function isUnreleased(item: Item, today: string): boolean {
  const d = item.book?.publicationDate ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d > today;
  if (/^\d{4}-\d{2}$/.test(d)) return d > today.slice(0, 7);
  return false; // a year alone doesn't say whether it's out
}

export interface ReleaseNotice {
  item: Item;
  date: string;
  days: number; // 0 = today
  key: string; // for dismissing; the 1-day notice has its own key
}

/** Home notices: from a week before a book comes out, and again the day before. */
export function releaseNotices(items: Item[], today: string, dismissed: Set<string>): ReleaseNotice[] {
  return releases(items, today, addDays(today, 7))
    .map(({ item, date }) => {
      const days = daysBetween(today, date);
      return { item, date, days, key: `${item.id}|${date}|${days <= 1 ? 'day' : 'week'}` };
    })
    .filter((n) => !dismissed.has(n.key));
}

export function releaseLabel(days: number): string {
  if (days <= 0) return 'Out today';
  if (days === 1) return 'Out tomorrow';
  return `Coming out in ${days} days`;
}

// ---- export to phone calendars ---------------------------------------------------------

const compact = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

function endOf(s: ReadingSession, date: string): [string, string] {
  const end = at(date, s.start);
  end.setMinutes(end.getMinutes() + s.minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [toDateString(end), `${pad(end.getHours())}:${pad(end.getMinutes())}`];
}

export function rrule(repeat: Repeat | undefined): string | undefined {
  if (repeat === 'daily') return 'FREQ=DAILY';
  if (repeat === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (repeat === 'weekly') return 'FREQ=WEEKLY';
  return undefined;
}

const icsText = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (bytes.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** An .ics calendar file for a session, with its reminder as an alarm. Times are local ("floating"). */
export function toIcs(s: ReadingSession, title: string, link: string, now = new Date()): string {
  const [endDate, endTimeStr] = endOf(s, s.date);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const rule = rrule(s.repeat);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reading Log//Reading calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${s.id}@reading-log`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${compact(s.date, s.start)}`,
    `DTEND:${compact(endDate, endTimeStr)}`,
    `SUMMARY:${icsText(`Read: ${title}`)}`,
    `DESCRIPTION:${icsText([s.note, link].filter(Boolean).join('\n'))}`,
    `URL:${link}`,
    ...(rule ? [`RRULE:${rule}`] : []),
    ...(rule && s.skipped?.length ? [`EXDATE:${s.skipped.map((d) => compact(d, s.start)).join(',')}`] : []),
    ...(s.remind !== undefined
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Read: ${title}`)}`, `TRIGGER:-PT${s.remind}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar "add event" link (uses the calendar's default reminder). */
export function googleCalendarUrl(s: ReadingSession, title: string, link: string): string {
  const [endDate, endTimeStr] = endOf(s, s.date);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Read: ${title}`,
    dates: `${compact(s.date, s.start)}/${compact(endDate, endTimeStr)}`,
    details: [s.note, link].filter(Boolean).join('\n'),
  });
  const rule = rrule(s.repeat);
  if (rule) q.set('recur', `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${q}`;
}
