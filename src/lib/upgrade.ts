// Records saved by older versions of the app, brought up to date. Each step only touches
// records that need it, so running it again changes nothing.
import type { Collections, Item, Reading } from './types';

/** Manga used to be books with the format "manga"; now they're a type of their own. */
export function upgradeItem(item: Item): Item | undefined {
  if (item.type !== 'book' || (item.book?.format as string | undefined) !== 'manga') return undefined;
  const { format: _manga, ...book } = item.book!;
  return { ...item, type: 'manga', book };
}

/** A read-through could be marked as read in the "manga" format; that's now the item's type. */
export function upgradeReading(r: Reading): Reading | undefined {
  if ((r.format as string | undefined) !== 'manga') return undefined;
  const { format: _manga, ...rest } = r;
  return rest;
}

/** Just the records that need upgrading, upgraded. */
export function upgrades(c: Pick<Collections, 'items' | 'readings'>): { items: Item[]; readings: Reading[] } {
  return {
    items: c.items.map(upgradeItem).filter((i): i is Item => !!i),
    readings: c.readings.map(upgradeReading).filter((r): r is Reading => !!r),
  };
}

/** The collections with every old record upgraded (each keeps its updatedAt). */
export function upgradeCollections(c: Collections): Collections {
  return {
    ...c,
    items: c.items.map((i) => upgradeItem(i) ?? i),
    readings: c.readings.map((r) => upgradeReading(r) ?? r),
  };
}
