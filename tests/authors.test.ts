import { describe, expect, it } from 'vitest';
import { linkedPseudonyms, pseudonymsOf, unlinkedPseudonym } from '../src/lib/authors';
import type { Author } from '../src/lib/types';

const t = '2026-01-01T00:00:00.000Z';
const author = (id: string, fields: Partial<Author> = {}): Author => ({ id, createdAt: t, updatedAt: t, name: id, altNames: [], ...fields });

/** Applies saved records to a list, as the store does. */
const apply = (all: Author[], saved: Author[]) => all.map((a) => saved.find((s) => s.id === a.id) ?? a);
const keyOf = (all: Author[], id: string) => all.find((a) => a.id === id)!.personKey;

describe('pseudonyms', () => {
  it('links two authors both ways', () => {
    let all = [author('King'), author('Bachman'), author('Other')];
    const saved = linkedPseudonyms(all, all[1], all[0], () => 'k1');
    expect(saved.map((a) => [a.id, a.personKey])).toEqual([
      ['King', 'k1'],
      ['Bachman', 'k1'],
    ]);
    all = apply(all, saved);
    expect(pseudonymsOf(all, all[0]).map((a) => a.id)).toEqual(['Bachman']);
    expect(pseudonymsOf(all, all[1]).map((a) => a.id)).toEqual(['King']);
    expect(pseudonymsOf(all, all[2])).toEqual([]);
    expect(linkedPseudonyms(all, all[0], all[1])).toEqual([]); // already linked: nothing to save
    expect(linkedPseudonyms(all, all[0], all[0])).toEqual([]);
  });

  it('joins groups: a third name of one person is linked to all of them', () => {
    let all = [author('A', { personKey: 'k1' }), author('B', { personKey: 'k1' }), author('C'), author('D', { personKey: 'k2' }), author('E', { personKey: 'k2' })];
    all = apply(all, linkedPseudonyms(all, all[2], all[1]));
    expect(['A', 'B', 'C'].map((id) => keyOf(all, id))).toEqual(['k1', 'k1', 'k1']);
    expect(pseudonymsOf(all, all[2]).map((a) => a.id)).toEqual(['A', 'B']);
    // Two groups of one person: everyone ends up together.
    all = apply(all, linkedPseudonyms(all, all[3], all[0]));
    expect(['A', 'B', 'C', 'D', 'E'].map((id) => keyOf(all, id))).toEqual(['k2', 'k2', 'k2', 'k2', 'k2']);
    expect(pseudonymsOf(all, all[4]).map((a) => a.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('leaves out deleted authors', () => {
    const all = [author('A', { personKey: 'k' }), author('B', { personKey: 'k', deleted: true }), author('C', { personKey: 'k' })];
    expect(pseudonymsOf(all, all[0]).map((a) => a.id)).toEqual(['C']);
  });

  it('unlinks one name; a group of one is no group', () => {
    let all = [author('A', { personKey: 'k' }), author('B', { personKey: 'k' }), author('C', { personKey: 'k' })];
    all = apply(all, unlinkedPseudonym(all, all[1]));
    expect(all.map((a) => a.personKey)).toEqual(['k', undefined, 'k']);
    expect(pseudonymsOf(all, all[0]).map((a) => a.id)).toEqual(['C']);
    all = apply(all, unlinkedPseudonym(all, all[2]));
    expect(all.map((a) => a.personKey)).toEqual([undefined, undefined, undefined]);
    expect(unlinkedPseudonym(all, all[0])).toEqual([]);
  });
});
