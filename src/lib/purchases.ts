// Stores you've bought from, for the Store dropdown when adding a purchase.
import type { Item } from './types';
import { collator, normalize } from './util';

/**
 * Stores used in purchases, most used first (then A–Z). Spellings that differ only in
 * case ("Amazon JP", "amazon jp") are one store, shown as its most used spelling.
 * `extra` adds stores not saved yet (e.g. typed elsewhere in the same form).
 */
export function knownStores(items: Item[], extra: (string | undefined)[] = []): string[] {
  const groups = new Map<string, Map<string, number>>(); // store → spelling → uses
  const add = (name: string | undefined) => {
    const s = name?.trim();
    if (!s) return;
    const key = normalize(s);
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(s, (spellings.get(s) ?? 0) + 1);
    groups.set(key, spellings);
  };
  for (const item of items) if (!item.deleted) for (const p of item.book?.purchases ?? []) add(p.store);
  for (const s of extra) add(s);
  return [...groups.values()]
    .map((spellings) => ({
      name: [...spellings].reduce((best, s) => (s[1] > best[1] ? s : best))[0],
      uses: [...spellings.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.uses - a.uses || collator.compare(a.name, b.name))
    .map((s) => s.name);
}

/** A store name as saved: trimmed, and spelled like a store already used ("amazon jp" → "Amazon JP"). */
export function storeName(name: string | undefined, known: string[]): string | undefined {
  const s = name?.trim();
  if (!s) return undefined;
  const key = normalize(s);
  return known.find((k) => normalize(k) === key) ?? s;
}
