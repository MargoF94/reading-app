// Pre-filled data for the add/edit form, coming from lookups and imports.
// Names (authors, publisher, series, genres, tags) are plain strings; the form
// matches them to existing records or offers them as new ones.
import type { BookDetails, FicDetails, ItemType } from './types';
import { newId } from './util';

export interface ItemDraft {
  type: ItemType;
  /** Where the data came from, shown to the user (e.g. "AO3", "Open Library"). */
  source?: string;
  title?: string;
  originalTitle?: string;
  titleReading?: string;
  authors?: string[];
  language?: string;
  originalLanguage?: string;
  series?: string;
  seriesNumber?: string;
  description?: string;
  coverUrl?: string;
  genres?: string[];
  tags?: string[];
  wordCount?: number;
  book?: Partial<Omit<BookDetails, 'publisherId' | 'purchases'>> & { publisher?: string };
  fic?: Partial<FicDetails>;
}

const memory = new Map<string, ItemDraft>();
const PREFIX = 'reading-app-draft:';

export function saveDraft(draft: ItemDraft): string {
  const id = newId().slice(0, 8);
  memory.set(id, draft);
  try {
    sessionStorage.setItem(PREFIX + id, JSON.stringify(draft));
  } catch {
    /* storage unavailable: memory copy is enough until reload */
  }
  return id;
}

export function loadDraft(id: string | null | undefined): ItemDraft | undefined {
  if (!id) return undefined;
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as ItemDraft) : undefined;
  } catch {
    return undefined;
  }
}
