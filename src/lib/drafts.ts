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
  /** Other series it's in (AO3 works and Goodreads books can be in several). */
  moreSeries?: { name: string; number?: string }[];
  description?: string;
  coverUrl?: string;
  genres?: string[];
  tags?: string[];
  wordCount?: number;
  book?: Partial<Omit<BookDetails, 'publisherId' | 'purchases'>> & { publisher?: string };
  fic?: Partial<FicDetails>;
}

/** Every series in a draft, the main one first. */
export function draftSeries(d: ItemDraft): { name: string; number?: string }[] {
  const all = [...(d.series ? [{ name: d.series, number: d.seriesNumber }] : []), ...(d.moreSeries ?? [])];
  return all.filter((s) => s.name?.trim());
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

// The file a draft was read from (e.g. an AO3 EPUB), so the form can offer to keep it.
// Memory only: files can't go into sessionStorage.
const files = new Map<string, File>();

export function attachDraftFile(id: string, file: File): void {
  files.set(id, file);
}

export function draftFile(id: string | null | undefined): File | undefined {
  return id ? files.get(id) : undefined;
}
