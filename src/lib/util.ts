import { CURRENCIES } from './constants';
import type { Currency } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(): string {
  return toDateString(new Date());
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats YYYY, YYYY-MM or YYYY-MM-DD without timezone surprises. */
export function formatDate(value?: string): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!m) return String(y);
  if (!d) return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Normalises text for searching across English, Russian and Japanese:
 * full/half-width folding, case folding, ё→е, katakana→hiragana.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}

export const collator = new Intl.Collator(['en', 'ru', 'ja'], { sensitivity: 'base', numeric: true });

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function formatMoney(amount: number, currency: Currency): string {
  const c = CURRENCIES.find((x) => x.value === currency)!;
  return c.symbol + amount.toLocaleString('en-US', {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Parses "1,234" / "1 234" style numbers; returns undefined for blanks. */
export function parseNumber(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = value.replace(/[\s,]/g, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Extracts the AO3 work id from a work or chapter URL. */
export function ao3WorkId(url?: string): string | undefined {
  return url?.match(/archiveofourown\.org\/(?:collections\/[^/]+\/)?works\/(\d+)/)?.[1];
}

/** A listening link typed by the user: http(s) only, "https://" added if missing. */
export function songUrl(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Stable colour for generated covers and chips. */
export function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
