// What a newer EPUB of a fic changes: chapter and word counts, status, dates.
import type { ItemDraft } from './drafts';
import type { Item } from './types';

export interface FieldChange {
  label: string;
  from: string;
  to: string;
}

const num = (n: number | undefined) => (n === undefined ? '?' : n.toLocaleString('en-US'));

/** The changes a newer AO3 file brings to a fic, and the item fields to update. */
export function ficUpdateFromDraft(item: Item, draft: ItemDraft): { changes: FieldChange[]; patch: Partial<Item> } {
  const changes: FieldChange[] = [];
  const f = item.fic;
  const d = draft.fic;
  if (!f || !d) return { changes, patch: {} };
  const fic = { ...f };
  if (d.chaptersAvailable !== undefined && d.chaptersAvailable !== f.chaptersAvailable) {
    const total = d.chaptersTotal ?? f.chaptersTotal;
    changes.push({ label: 'Chapters', from: `${num(f.chaptersAvailable)}/${num(f.chaptersTotal)}`, to: `${num(d.chaptersAvailable)}/${num(total)}` });
    fic.chaptersAvailable = d.chaptersAvailable;
  }
  if (d.chaptersTotal !== undefined) fic.chaptersTotal = d.chaptersTotal;
  if (d.complete !== undefined && d.complete !== f.complete) {
    changes.push({ label: 'Status', from: f.complete ? 'Complete' : 'Work in progress', to: d.complete ? 'Complete' : 'Work in progress' });
    fic.complete = d.complete;
  }
  for (const key of ['updatedDate', 'completedDate'] as const) if (d[key]) fic[key] = d[key];
  const patch: Partial<Item> = { fic };
  if (draft.wordCount !== undefined && draft.wordCount !== item.wordCount) {
    changes.push({ label: 'Words', from: num(item.wordCount), to: num(draft.wordCount) });
    patch.wordCount = draft.wordCount;
    patch.wordCountEstimated = false;
  }
  return { changes, patch };
}
