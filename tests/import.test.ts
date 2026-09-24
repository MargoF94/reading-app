// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../src/lib/html';
import { collectAo3, parseAo3Html } from '../src/lib/import/ao3';
import {
  guessShelfStatus,
  mapBinding,
  parseGoodreadsCsv,
  parseGoodreadsTitle,
  planGoodreadsImport,
} from '../src/lib/import/goodreads-csv';
import { parseGoodreadsPayload } from '../src/lib/import/goodreads-page';
import { decodePayload, draftFromPayload } from '../src/lib/import/payload';
import { emptyCollections } from '../src/lib/merge';
import { deriveStatus } from '../src/lib/reading';
import type { Reading } from '../src/lib/types';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('AO3', () => {
  it('parses a saved work page', () => {
    const d = parseAo3Html(fixture('ao3-work.html'));
    expect(d.title).toBe('The Lantern Keeper');
    expect(d.authors).toEqual(['quillfox']);
    expect(d.language).toBe('ru');
    expect(d.series).toBe('Coastal Tales');
    expect(d.seriesNumber).toBe('2');
    expect(d.wordCount).toBe(12345);
    expect(d.description).toBe('A keeper of *lights*.\n\nSecond line\nwith a break.');
    expect(d.fic).toMatchObject({
      rating: 'teen',
      warnings: ['No Archive Warnings Apply'],
      categories: ['F/F', 'Gen'],
      fandoms: ['Original Work'],
      relationships: ['Mira/Tove'],
      characters: ['Mira', 'Tove'],
      additionalTags: ['Slow Burn', 'Lighthouses'],
      publishedDate: '2025-01-05',
      updatedDate: '2025-03-01',
      chaptersAvailable: 2,
      chaptersTotal: 5,
      complete: false,
      kudos: 1200,
      hits: 9876,
      bookmarks: 80,
      comments: 10,
      workId: '1234567',
      url: 'https://archiveofourown.org/works/1234567',
    });
  });

  it('parses AO3’s Download → HTML format', () => {
    const d = parseAo3Html(fixture('ao3-download.html'));
    expect(d.title).toBe('Salt and Stars');
    expect(d.authors).toEqual(['one', 'two']);
    expect(d.language).toBe('ja');
    expect(d.series).toBe('Tidal');
    expect(d.seriesNumber).toBe('3');
    expect(d.wordCount).toBe(40002);
    expect(d.description).toBe('Two sailors.');
    expect(d.fic).toMatchObject({
      rating: 'explicit',
      fandoms: ['Fandom One', 'Fandom Two'],
      completedDate: '2024-06-01',
      chaptersAvailable: 7,
      chaptersTotal: 7,
      complete: true,
      workId: '7654321',
    });
  });

  it('gives the same result through the bookmarklet fragments', () => {
    const html = fixture('ao3-work.html');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const payload = collectAo3(doc, 'https://archiveofourown.org/works/1234567/chapters/7654321') as Record<string, unknown>;
    expect(String(payload.h)).not.toContain('Long author notes');
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const viaBookmarklet = draftFromPayload(decodePayload(encoded));
    const direct = parseAo3Html(html);
    expect({ ...viaBookmarklet, fic: { ...viaBookmarklet.fic, statsDate: 0 } }).toEqual({
      ...direct,
      fic: { ...direct.fic, statsDate: 0 },
    });
  });

  it('refuses pages without work details', () => {
    expect(() => parseAo3Html('<html><body>nothing</body></html>')).toThrow();
    expect(collectAo3(new DOMParser().parseFromString('<p>x</p>', 'text/html'), 'https://example.com')).toMatch(/AO3|archiveofourown/i);
  });
});

describe('Goodreads page', () => {
  it('reads the Next.js data sent by the bookmarklet', () => {
    const d = parseGoodreadsPayload({
      s: 'gr',
      u: 'https://www.goodreads.com/book/show/42-the-test?from=search',
      st: {
        'Book:kca://book/1': {
          __typename: 'Book',
          legacyId: 42,
          title: 'The Test',
          description: 'A <i>fine</i> book.<br><br>Really.',
          imageUrl: 'https://images.example/cover.jpg',
          primaryContributorEdge: { node: { __ref: 'Contributor:1' }, role: 'Author' },
          secondaryContributorEdges: [
            { node: { __ref: 'Contributor:2' }, role: 'Translator' },
            { node: { __ref: 'Contributor:3' }, role: 'Author' },
          ],
          bookGenres: [{ genre: { name: 'Fantasy' } }, { genre: { name: 'Fiction' } }, { genre: { name: 'Magic' } }, { genre: { name: 'Adult' } }],
          bookSeries: [{ userPosition: '2', series: { __ref: 'Series:1' } }],
          details: {
            format: 'Hardcover',
            numPages: 321,
            publicationTime: Date.UTC(2020, 4, 17),
            publisher: 'Example House',
            isbn13: '9780306406157',
            language: { name: 'English' },
          },
          work: { __ref: 'Work:1' },
        },
        'Contributor:1': { __typename: 'Contributor', name: 'Ann Author' },
        'Contributor:2': { __typename: 'Contributor', name: 'Tim Translator' },
        'Contributor:3': { __typename: 'Contributor', name: 'Co Author' },
        'Series:1': { __typename: 'Series', title: 'Test Saga' },
        'Work:1': { __typename: 'Work', details: { originalTitle: 'Der Test', publicationTime: Date.UTC(1999, 0, 1) } },
      },
    });
    expect(d).toMatchObject({
      type: 'book',
      title: 'The Test',
      originalTitle: 'Der Test',
      authors: ['Ann Author', 'Co Author'],
      description: 'A *fine* book.\n\nReally.',
      coverUrl: 'https://images.example/cover.jpg',
      genres: ['Fantasy', 'Fiction', 'Magic'],
      series: 'Test Saga',
      seriesNumber: '2',
      language: 'en',
      book: {
        goodreadsUrl: 'https://www.goodreads.com/book/show/42',
        format: 'hardcover',
        pageCount: 321,
        publicationDate: '2020-05-17',
        publisher: 'Example House',
        isbn13: '9780306406157',
        isbn10: '0306406152',
        originalPublicationYear: 1999,
      },
    });
  });

  it('falls back to the page’s JSON-LD', () => {
    const d = parseGoodreadsPayload({
      s: 'gr',
      u: 'https://www.goodreads.com/book/show/7',
      ld: JSON.stringify({ name: 'Plain (Some Series, #3)', author: [{ name: 'X Y' }], isbn: '0306406152', numberOfPages: 99, bookFormat: 'Kindle Edition', inLanguage: 'Japanese' }),
      img: 'https://img.example/og.jpg',
    });
    expect(d).toMatchObject({ title: 'Plain', authors: ['X Y'], language: 'ja', coverUrl: 'https://img.example/og.jpg', book: { isbn13: '9780306406157', pageCount: 99, format: 'ebook' } });
  });
});

const CSV_HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

const CSV = [
  CSV_HEADER,
  '1,"The Test Book (Test Saga, #2)",Jane  Doe,"Doe, Jane",,"=""0306406152""","=""9780306406157""",4.0,Some Press,Paperback,320,2020,2019,2024/05/31,2024/01/02,"favourites, to-read-physical",,read,"Great <b>book</b><br/>Loved it <spoiler>twist</spoiler>",true,a note,2,0',
  '2,"霧の町 3 [Kiri no Machi]",Taro Yamada,"Yamada, Taro","山田太郎, 絵師",="",="",0,出版社,Tankobon Hardcover,200,2021,2021,,2024/02/03,,,to-read,,,,0,0',
  '3,"霧の町 4 [Kiri no Machi] (Japanese Edition)",Taro Yamada,"Yamada, Taro",山田太郎,="",="",0,出版社,Kindle Edition,210,2022,2022,,2024/02/04,,,currently-reading,,,,1,0',
  '4,Мастер и Маргарита,Mikhail Bulgakov,"Bulgakov, Mikhail",,="",="",0,Азбука,Hardcover,480,2015,1967,2023/03/03,2023/01/01,did-not-finish,,did-not-finish,,,,1,0',
  '5,"Multi ""Quoted"", Title",Anna Writer,"Writer, Anna",,="",="",5.0,,Audible Audio,12,2020,2020,,2020/01/01,,,read,"Line one',
  'line two",,,1,0',
  '6,"Light Series, Vol. 8",Some One,"One, Some",,="",="",0,,ebook,200,2020,2020,,2020/01/01,,,to-read,,,,0,0',
].join('\n');

describe('Goodreads CSV', () => {
  it('parses titles', () => {
    expect(parseGoodreadsTitle('Senlin Ascends (The Books of Babel, #1)')).toMatchObject({ title: 'Senlin Ascends', series: 'The Books of Babel', seriesNumber: '1' });
    expect(parseGoodreadsTitle('Tempting Venom (Vipers #3)')).toMatchObject({ title: 'Tempting Venom', series: 'Vipers', seriesNumber: '3' });
    expect(parseGoodreadsTitle('A Dragon (Moonfall, 3)')).toMatchObject({ title: 'A Dragon', series: 'Moonfall', seriesNumber: '3' });
    expect(parseGoodreadsTitle('Stolen (Beasts of the Briar Book 6)')).toMatchObject({ series: 'Beasts of the Briar', seriesNumber: '6' });
    expect(parseGoodreadsTitle('屍鬼 1 [Shiki]')).toMatchObject({ title: '屍鬼 1', titleReading: 'Shiki' });
    expect(parseGoodreadsTitle('十二人の死にたい子どもたち (文春文庫)')).toMatchObject({ title: '十二人の死にたい子どもたち' });
    expect(parseGoodreadsTitle('Bird Box: A Novel (Harper Perennial Olive Editions)').title).toBe('Bird Box: A Novel (Harper Perennial Olive Editions)');
  });

  it('maps bindings and shelves', () => {
    expect(mapBinding('Kindle Edition')).toBe('ebook');
    expect(mapBinding('Mass Market Paperback')).toBe('paperback');
    expect(mapBinding('Audible Audio')).toBe('audiobook');
    expect(mapBinding('Unknown Binding')).toBeUndefined();
    expect(guessShelfStatus('did-not-finish')).toBe('dnf');
    expect(guessShelfStatus('on-hold')).toBe('on-hold');
    expect(guessShelfStatus('favourites')).toBe('want-to-read');
  });

  it('reads the export and plans an import', () => {
    const res = parseGoodreadsCsv(CSV);
    expect(res.books).toHaveLength(6);
    const [a, b, c, d, e, f] = res.books;
    expect(a).toMatchObject({ title: 'The Test Book', series: 'Test Saga', seriesNumber: '2', author: 'Jane Doe', isbn13: '9780306406157', rating: 4, readCount: 2, dateRead: '2024-05-31', shelves: ['favourites', 'to-read-physical'], spoiler: true, language: 'en', originalYear: 2019 });
    expect(b).toMatchObject({ title: '霧の町 3', titleReading: 'Kiri no Machi', series: '霧の町', seriesNumber: '3', authorAltName: '山田太郎', additionalAuthors: ['絵師'], language: 'ja' });
    expect(c).toMatchObject({ title: '霧の町 4', series: '霧の町', seriesNumber: '4', format: 'ebook' });
    expect(d).toMatchObject({ language: 'ru', exclusiveShelf: 'did-not-finish', shelves: [] });
    expect(e).toMatchObject({ title: 'Multi "Quoted", Title', format: 'audiobook', pageCount: undefined, review: 'Line one\nline two', rating: 5 });
    expect(f).toMatchObject({ series: 'Light Series', seriesNumber: '8' });
    expect(res.tagShelves.map((s) => s.name)).toEqual(['favourites', 'to-read-physical']);

    const shelfStatus = Object.fromEntries(res.exclusiveShelves.map((s) => [s.name, guessShelfStatus(s.name)]));
    const plan = planGoodreadsImport(res.books, emptyCollections(), { shelfStatus, shelvesAsTags: true, guessLanguage: true, additionalAuthors: false }, '2026-09-24T00:00:00.000Z');
    const { items, readings, authors, series, tags } = plan.records;
    expect(items).toHaveLength(6);
    const readingsOf = (title: string) => readings.filter((r) => r.itemId === items.find((i) => i.title === title)!.id) as Reading[];
    expect(deriveStatus(readingsOf('The Test Book'))).toBe('read');
    expect(readingsOf('The Test Book')).toHaveLength(2);
    expect(deriveStatus(readingsOf('霧の町 3'))).toBe('want-to-read');
    expect(deriveStatus(readingsOf('霧の町 4'))).toBe('currently-reading');
    expect(deriveStatus(readingsOf('Мастер и Маргарита'))).toBe('dnf');
    const test = items.find((i) => i.title === 'The Test Book')!;
    expect(test.createdAt).toBe('2024-01-02T12:00:00.000Z');
    expect(test.review).toBe('Great **book**\nLoved it ||twist||');
    expect(test.book?.goodreadsUrl).toBe('https://www.goodreads.com/book/show/1');
    const yamada = authors.find((x) => x.name === 'Taro Yamada')!;
    expect(yamada.altNames).toEqual(['山田太郎']);
    expect(authors.some((x) => x.name === '絵師')).toBe(false);
    expect(series.map((s) => s.name).sort()).toEqual(['Light Series', 'Test Saga', '霧の町']);
    expect(tags.map((t) => t.name).sort()).toEqual(['favourites', 'to-read-physical']);

    // Importing again skips everything.
    const existing = { ...emptyCollections(), ...plan.records };
    const again = planGoodreadsImport(res.books, existing, { shelfStatus, shelvesAsTags: true, guessLanguage: true, additionalAuthors: false }, '2026-09-25T00:00:00.000Z');
    expect(again.added).toBe(0);
    expect(again.duplicates).toHaveLength(6);
  });

  it('rejects other CSV files', () => {
    expect(() => parseGoodreadsCsv('a,b\n1,2')).toThrow(/Goodreads/);
  });
});

describe('htmlToMarkdown', () => {
  it('converts common formatting', () => {
    expect(htmlToMarkdown('<p>One <b>two</b></p><p>Three<br>four</p><ul><li>x</li><li>y</li></ul>')).toBe('One **two**\n\nThree\nfour\n\n- x\n- y');
    expect(htmlToMarkdown('<a href="https://example.com">site</a> <script>alert(1)</script>')).toBe('[site](https://example.com)');
  });
});
