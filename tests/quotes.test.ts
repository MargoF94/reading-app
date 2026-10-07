import { describe, expect, it } from 'vitest';
import { filterQuotes, quoteText, type QuoteSource } from '../src/lib/quotes';
import { emptyCollections, parseLibraryFile, toLibraryFile } from '../src/lib/merge';
import type { Quote } from '../src/lib/types';

const q = (id: string, itemId: string, text: string, extra: Partial<Quote> = {}): Quote => ({
  id,
  createdAt: id,
  updatedAt: id,
  itemId,
  text,
  ...extra,
});

const sources: Record<string, QuoteSource> = {
  b: { title: 'Beloved', by: 'Toni Morrison' },
  a: { title: 'An Elegy', by: 'Someone' },
};
const src = (id: string) => sources[id];

const quotes = [q('1', 'b', 'Definitions belong to the definers.'), q('2', 'a', 'Grief is love.', { note: 'mine' }), q('3', 'b', 'Freeing yourself was one thing.', { location: 'p. 95' })];

describe('quotes', () => {
  it('keeps the order added, or newest first', () => {
    expect(filterQuotes(quotes, src, '', 'added').map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(filterQuotes(quotes, src, '', 'newest').map((x) => x.id)).toEqual(['3', '2', '1']);
  });

  it('groups by book title, each book in the order added', () => {
    expect(filterQuotes(quotes, src, '', 'item').map((x) => x.id)).toEqual(['2', '1', '3']);
  });

  it('searches text, notes, locations, titles and authors', () => {
    expect(filterQuotes(quotes, src, 'grief', 'added').map((x) => x.id)).toEqual(['2']);
    expect(filterQuotes(quotes, src, 'MINE', 'added').map((x) => x.id)).toEqual(['2']);
    expect(filterQuotes(quotes, src, 'p. 95', 'added').map((x) => x.id)).toEqual(['3']);
    expect(filterQuotes(quotes, src, 'morrison', 'added').map((x) => x.id)).toEqual(['1', '3']);
  });

  it('copies with the source and location', () => {
    expect(quoteText(quotes[2], sources.b)).toBe('“Freeing yourself was one thing.”\n— Beloved, Toni Morrison (p. 95)');
    expect(quoteText(quotes[0], undefined)).toBe('“Definitions belong to the definers.”');
  });

  it('sync files carry quotes', () => {
    const c = emptyCollections();
    c.quotes.push(quotes[0]);
    const file = toLibraryFile(c, 'now');
    expect(file.schema).toBe(6);
    expect(parseLibraryFile(JSON.stringify(file)).quotes).toHaveLength(1);
    expect(parseLibraryFile(JSON.stringify({ app: 'reading-app', schema: 3, items: [] })).quotes).toEqual([]);
  });
});
