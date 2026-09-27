// Sends a reading session to the phone's calendar app, whose alerts work even
// when this app is closed.
import { googleCalendarUrl, toIcs } from './schedule';
import type { Item, ReadingSession } from './types';

export function itemLink(item: Item): string {
  return `${location.origin}${location.pathname}#/item/${item.id}`;
}

/** Downloads an .ics file; phones offer to add it to Calendar (iPhone) or open it with the calendar app. */
export function addToPhoneCalendar(session: ReadingSession, item: Item): void {
  const ics = toIcs(session, item.title, itemLink(item));
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `read-${item.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'book'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function openInGoogleCalendar(session: ReadingSession, item: Item): void {
  window.open(googleCalendarUrl(session, item.title, itemLink(item)), '_blank', 'noopener');
}

const EXPORT_KEY = 'reading-app:add-to-phone-calendar';

/** Whether new sessions are also sent to the phone's calendar (remembered per device). */
export function exportByDefault(): boolean {
  try {
    return localStorage.getItem(EXPORT_KEY) !== 'no';
  } catch {
    return true;
  }
}

export function setExportByDefault(on: boolean): void {
  try {
    localStorage.setItem(EXPORT_KEY, on ? 'yes' : 'no');
  } catch {
    /* storage blocked: the choice just isn't remembered */
  }
}
