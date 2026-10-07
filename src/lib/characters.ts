// Characters: records you create (with pictures) for books, and AO3 character tags
// on fics. A fic tag belongs to a character when it matches the name or one of the
// other names, ignoring AO3's fandom in brackets: "Piranesi (Piranesi - Susanna Clarke)".
import type { Character, Item, ItemImage } from './types';
import { collator, normalize } from './util';

/** AO3 tag without the fandom in brackets. */
export const tagName = (tag: string): string => tag.replace(/\s*\([^()]*\)\s*$/, '').trim() || tag.trim();

/** Comparison key for a character name or tag. */
export const charKey = (name: string): string => normalize(tagName(name)).replace(/\s+/g, ' ');

export interface CharacterEntry {
  /** The record, when there is one; tag-only characters have none yet. */
  character?: Character;
  name: string;
  /** For tag-only characters: the key used in their page link. */
  key: string;
  items: Item[];
  books: number;
  fics: number;
}

/** Every character: records, plus fic character tags that don't match a record. */
export function characterIndex(characters: Character[], items: Item[]): CharacterEntry[] {
  const live = characters.filter((c) => !c.deleted);
  const byKey = new Map<string, Character>();
  for (const c of live) for (const n of [c.name, ...c.altNames]) if (n.trim()) byKey.set(charKey(n), c);

  const entries = new Map<string, CharacterEntry>();
  const entryFor = (c: Character | undefined, key: string, name: string) => {
    const id = c ? `c:${c.id}` : `t:${key}`;
    let e = entries.get(id);
    if (!e) entries.set(id, (e = { character: c, name: c?.name ?? name, key, items: [], books: 0, fics: 0 }));
    return e;
  };
  for (const c of live) entryFor(c, charKey(c.name), c.name);

  for (const item of items) {
    const seen = new Set<CharacterEntry>();
    for (const id of item.characterIds ?? []) {
      const c = live.find((x) => x.id === id);
      if (c) seen.add(entryFor(c, charKey(c.name), c.name));
    }
    for (const tag of item.fic?.characters ?? []) {
      const key = charKey(tag);
      if (!key) continue;
      seen.add(entryFor(byKey.get(key), key, tagName(tag)));
    }
    for (const e of seen) {
      e.items.push(item);
      if (item.type === 'fic') e.fics++;
      else e.books++;
    }
  }
  return [...entries.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** The character a fic tag points to, if there's a record for it. */
export function characterForTag(characters: Character[], tag: string): Character | undefined {
  const key = charKey(tag);
  return characters.find((c) => !c.deleted && [c.name, ...c.altNames].some((n) => charKey(n) === key));
}

/** The picture used as the character's avatar. */
export function mainImage(c: Character | undefined): ItemImage | undefined {
  const imgs = c?.images ?? [];
  return imgs.find((i) => i.id === c?.mainImageId) ?? imgs[0];
}

/** "1 book · 3 fics" */
export function appearances(books: number, fics: number): string {
  const parts = [];
  if (books) parts.push(`${books} ${books === 1 ? 'book' : 'books'}`);
  if (fics) parts.push(`${fics} ${fics === 1 ? 'fic' : 'fics'}`);
  return parts.join(' · ') || 'Not in any book or fic yet';
}

/** "Piranesi, Matthew Rose Sorensen" → ["Piranesi", "Matthew Rose Sorensen"] */
export const splitNames = (s: string): string[] =>
  [...new Set(s.split(/[,、，;]/).map((x) => x.trim()).filter(Boolean))];

/** Link to a character's page: by record, or by tag for characters without a page yet. */
export function characterHref(c: Character | undefined, tag?: string): string {
  if (c) return `#/character/${c.id}`;
  return `#/character?tag=${encodeURIComponent(tagName(tag ?? ''))}`;
}
