// Pseudonyms: one person writing under several names. Each name stays an author of its own,
// with its own books; the names of one person share a personKey, so each name's page lists
// the others. Linking works like editions of a book: in groups, joined when linked.
import type { Author } from './types';
import { collator, newId } from './util';

/** The other names the same person writes under, by name. */
export function pseudonymsOf(authors: Author[], author: Author): Author[] {
  if (!author.personKey) return [];
  return authors
    .filter((a) => !a.deleted && a.id !== author.id && a.personKey === author.personKey)
    .sort((x, y) => collator.compare(x.name, y.name));
}

/** The authors to save so that `a` and `b` are names of the same person (their groups joined). */
export function linkedPseudonyms(authors: Author[], a: Author, b: Author, newKey: () => string = newId): Author[] {
  if (a.id === b.id) return [];
  const key = a.personKey ?? b.personKey ?? newKey();
  const old = new Set([a.personKey, b.personKey].filter((k): k is string => !!k && k !== key));
  return authors
    .filter((x) => !x.deleted && (x.id === a.id || x.id === b.id || (!!x.personKey && old.has(x.personKey))))
    .filter((x) => x.personKey !== key)
    .map((x) => ({ ...x, personKey: key }));
}

/** The authors to save to take one name out of its group (a group of one is no group). */
export function unlinkedPseudonym(authors: Author[], author: Author): Author[] {
  if (!author.personKey) return [];
  const others = pseudonymsOf(authors, author);
  const out: Author[] = [{ ...author, personKey: undefined }];
  if (others.length === 1) out.push({ ...others[0], personKey: undefined });
  return out;
}
