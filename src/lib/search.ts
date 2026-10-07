// One search across the library: books and fics, quotes, learned words, and
// your own notes and reviews. Matching ignores case, ё/е and katakana/hiragana.
import type { Item, Quote, VocabWord } from './types';
import { normalize } from './util';

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export type HitKind = 'item' | 'quote' | 'word' | 'note';

export interface Hit {
  kind: HitKind;
  id: string;
  itemId: string;
  /** What matched, cut around the match. */
  text: Snippet;
  /** Where it matched, e.g. "tag", "Review", "Chapter 3". */
  where?: string;
}

export interface SearchSource {
  items: Item[];
  quotes: Quote[];
  words: VocabWord[];
  /** Names shown for an item: authors, series, tags, genres… as [label, value] pairs. */
  facets: (item: Item) => [string, string][];
}

/** Text around the first match of `needle` (already normalized), or undefined. */
export function snippet(text: string | undefined, needle: string, radius = 70): Snippet | undefined {
  if (!text || !needle) return undefined;
  const hay = normalize(text);
  const i = hay.indexOf(needle);
  if (i < 0) return undefined;
  // normalize() keeps lengths for ordinary text; if it didn't, show the start without a mark.
  if (hay.length !== text.length) return { before: '', match: '', after: clip(text, 0, radius * 2) };
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + needle.length + radius);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, i).replace(/\s+/g, ' ').trimStart(),
    match: text.slice(i, i + needle.length),
    after: text.slice(i + needle.length, end).replace(/\s+/g, ' ').trimEnd() + (end < text.length ? '…' : ''),
  };
}

function clip(text: string, from: number, len: number): string {
  const t = text.slice(from, from + len).replace(/\s+/g, ' ').trim();
  return t + (text.length > from + len ? '…' : '');
}

export function searchAll(src: SearchSource, query: string, limit = 100): Record<HitKind, Hit[]> {
  const out: Record<HitKind, Hit[]> = { item: [], quote: [], word: [], note: [] };
  const needle = normalize(query.trim());
  if (needle.length < 1) return out;
  const push = (kind: HitKind, hit: Hit) => {
    if (out[kind].length < limit) out[kind].push(hit);
  };

  for (const item of src.items) {
    const titles = [item.title, item.originalTitle, item.titleReading];
    let hit = titles.map((t) => snippet(t, needle, 200)).find(Boolean);
    let where: string | undefined;
    if (!hit) {
      for (const [label, value] of src.facets(item)) {
        hit = snippet(value, needle, 60);
        if (hit) {
          where = label;
          break;
        }
      }
    }
    if (hit) push('item', { kind: 'item', id: item.id, itemId: item.id, text: hit, where });

    for (const [label, text] of [
      ['Review', item.review],
      ['Notes', item.notes],
    ] as const) {
      const s = snippet(text, needle);
      if (s) push('note', { kind: 'note', id: `${item.id}:${label}`, itemId: item.id, text: s, where: label });
    }
  }

  for (const q of src.quotes) {
    const s = snippet(q.text, needle, 90);
    const n = s ? undefined : snippet(q.note, needle);
    if (s || n) push('quote', { kind: 'quote', id: q.id, itemId: q.itemId, text: s ?? n!, where: n ? 'your note' : q.location });
  }

  for (const w of src.words) {
    const inWord = snippet(w.word, needle, 40);
    const sense = inWord ? undefined : w.senses.map((x) => snippet(x.text, needle)).find(Boolean);
    const note = inWord || sense ? undefined : snippet(w.note, needle);
    const s = inWord ?? sense ?? note;
    if (s) push('word', { kind: 'word', id: w.id, itemId: w.itemId, text: s, where: inWord ? undefined : sense ? w.word : `${w.word} · note` });
  }
  return out;
}
