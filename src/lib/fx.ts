// JPY/USD exchange rates for purchase dates, from free sources that allow
// browser requests. Rates are stored on each purchase, so lookups happen once.
import type { Currency, FxSnapshot, Purchase } from './types';
import { today } from './util';

const cache = new Map<string, Promise<FxSnapshot | null>>();

async function tryJson(url: string): Promise<Record<string, any> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRates(date: string | 'latest'): Promise<FxSnapshot | null> {
  // 1. Frankfurter (European Central Bank reference rates)
  for (const url of [
    `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=JPY`,
    `https://api.frankfurter.app/${date}?from=USD&to=JPY`,
  ]) {
    const d = await tryJson(url);
    const jpy = d?.rates?.JPY;
    if (typeof jpy === 'number') return { date: d!.date ?? today(), perUsd: { USD: 1, JPY: jpy } };
  }
  // 2. fawazahmed0/exchange-api via jsDelivr
  const d = await tryJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`);
  const jpy = d?.usd?.jpy;
  if (typeof jpy === 'number') return { date: d!.date ?? today(), perUsd: { USD: 1, JPY: jpy } };
  return null;
}

/** Rates for a day (YYYY-MM-DD); today or future dates use the latest rates. */
export function ratesFor(date: string | undefined): Promise<FxSnapshot | null> {
  const key = !date || date >= today() ? 'latest' : date;
  let p = cache.get(key);
  if (!p) {
    p = fetchRates(key).then((r) => {
      if (!r) cache.delete(key); // retry next time
      return r;
    });
    cache.set(key, p);
  }
  return p;
}

export function convert(amount: number, from: Currency, to: Currency, fx: FxSnapshot | undefined): number | undefined {
  if (from === to) return amount;
  const a = fx?.perUsd[from];
  const b = fx?.perUsd[to];
  if (!a || !b) return undefined;
  return (amount / a) * b;
}

/** Adds rates to priced purchases that don't have them. Never throws. */
export async function withRates(purchases: Purchase[]): Promise<Purchase[]> {
  return Promise.all(
    purchases.map(async (p) => {
      if (p.price === undefined || p.fx) return p;
      const fx = await ratesFor(p.date);
      return fx ? { ...p, fx } : p;
    }),
  );
}

export function needsRates(p: Purchase): boolean {
  return p.price !== undefined && !p.fx;
}
