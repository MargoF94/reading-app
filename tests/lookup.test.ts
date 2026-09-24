// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convert } from '../src/lib/fx';
import { isbn10to13, isbn13to10, parseIsbn, validIsbn13 } from '../src/lib/isbn';
import { goodreadsSlugQuery, lookupIsbn, mergeDrafts, normalizePubDate } from '../src/lib/lookup';

describe('ISBN', () => {
  it('converts and validates', () => {
    expect(isbn10to13('0306406152')).toBe('9780306406157');
    expect(isbn13to10('9780306406157')).toBe('0306406152');
    expect(parseIsbn('978-4-06-203516-3')).toEqual({ isbn13: '9784062035163', isbn10: '4062035162' });
    expect(parseIsbn('059382024X')).toEqual({ isbn13: '9780593820247', isbn10: '059382024X' });
    expect(parseIsbn('9784062035164')).toBeNull();
    expect(validIsbn13('9791234567896')).toBe(true);
  });
});

describe('lookup helpers', () => {
  it('normalises publication dates', () => {
    expect(normalizePubDate('2004')).toBe('2004');
    expect(normalizePubDate('2004-03-01')).toBe('2004-03-01');
    expect(normalizePubDate('20200131')).toBe('2020-01-31');
    expect(normalizePubDate('202001')).toBe('2020-01');
    expect(normalizePubDate('Mar 01, 2004')).toBe('2004-03-01');
    expect(normalizePubDate('circa 1999')).toBe('1999');
  });

  it('reads Goodreads links', () => {
    expect(goodreadsSlugQuery('https://www.goodreads.com/book/show/186074.The_Name_of_the_Wind')).toBe('The Name of the Wind');
    expect(goodreadsSlugQuery('https://www.goodreads.com/book/show/186074-the-name-of-the-wind?ref=x')).toBe('the name of the wind');
    expect(goodreadsSlugQuery('https://www.goodreads.com/book/show/186074')).toBeUndefined();
  });

  it('merges drafts, earlier sources first', () => {
    const m = mergeDrafts([
      { type: 'book', source: 'A', title: 'T', authors: [], book: { pageCount: 10 } },
      { type: 'book', source: 'B', title: 'Other', authors: ['X'], description: 'd', book: { pageCount: 20, publisher: 'P' } },
    ]);
    expect(m).toMatchObject({ title: 'T', authors: ['X'], description: 'd', source: 'A + B', book: { pageCount: 10, publisher: 'P' } });
  });
});

describe('lookupIsbn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('combines Google Books and Open Library', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('googleapis')) {
        return new Response(
          JSON.stringify({
            items: [{ volumeInfo: { title: 'Norwegian Wood', authors: ['Haruki Murakami'], description: '<p>Love.</p>', language: 'en', pageCount: 296, imageLinks: { thumbnail: 'http://books.google.com/x&edge=curl' } } }],
          }),
        );
      }
      if (url.includes('openlibrary.org/api/books')) {
        return new Response(
          JSON.stringify({ 'ISBN:9780375704024': { title: 'Norwegian wood', publishers: [{ name: 'Vintage' }], publish_date: '2000', number_of_pages: 300, cover: { large: 'https://covers.openlibrary.org/b/id/1-L.jpg' } } }),
        );
      }
      return new Response('{}', { status: 404 });
    });
    const d = await lookupIsbn('9780375704024');
    expect(d).toMatchObject({
      title: 'Norwegian Wood',
      authors: ['Haruki Murakami'],
      description: 'Love.',
      language: 'en',
      coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      source: 'Google Books + Open Library',
      book: { pageCount: 296, publisher: 'Vintage', publicationDate: '2000', isbn13: '9780375704024', isbn10: '0375704027' },
    });
  });

  it('returns nothing when every source fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await lookupIsbn('9780375704024')).toBeUndefined();
  });
});

describe('currency', () => {
  it('converts with a day’s rates', () => {
    const fx = { date: '2024-01-15', perUsd: { USD: 1, JPY: 150 } };
    expect(convert(1500, 'JPY', 'USD', fx)).toBe(10);
    expect(convert(10, 'USD', 'JPY', fx)).toBe(1500);
    expect(convert(10, 'USD', 'USD', undefined)).toBe(10);
    expect(convert(10, 'USD', 'JPY', undefined)).toBeUndefined();
  });
});
