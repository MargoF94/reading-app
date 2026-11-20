// Books pinned to the top of Home, for quick access to what you're reading. A pin is the
// time it was pinned (item.pinnedAt), synced like the rest of the item.
import type { Item, Status } from './types';

/** Pinned items, the most recently pinned first. */
export function pinnedItems(items: Item[]): Item[] {
  return items.filter((i) => i.pinnedAt && !i.deleted).sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!));
}

/** Finishing a book, or stopping it, takes it off Home. */
export const unpinsOn = (status: Status): boolean => status === 'read' || status === 'dnf';
