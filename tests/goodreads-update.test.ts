// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { parseGoodreadsPayload } from '../src/lib/import/goodreads-page';
import {
  fillFromDraft,
  goodreadsUpdateBookmarklet,
  updateCandidates,
} from '../src/lib/import/goodreads-update';
import type { Item } from '../src/lib/types';

const APP = 'https://margof94.github.io/reading-app/';

function book(extra: Partial<Item> = {}, bookExtra: Partial<NonNullable<Item['book']>> = {}): Item {
  return {
    id: 'b1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    type: 'book',
    title: 'The Test',
    authorIds: ['a1'],
    genreIds: ['g-mine'],
    tagIds: [],
    rating: 4.5,
    book: { goodreadsUrl: 'https://www.goodreads.com/book/show/42', pageCount: 300, purchases: [], ...bookExtra },
    ...extra,
  };
}

const nextData = {
  props: {
    pageProps: {
      apolloState: {
        'Book:1': {
          __typename: 'Book',
          legacyId: 42,
          title: 'The Test (Tests, #2)',
          description: 'A <i>fine</i> book.',
          imageUrl: 'https://images.example/cover.jpg',
          primaryContributorEdge: { node: { __ref: 'Contributor:1' }, role: 'Author' },
          bookGenres: [{ genre: { name: 'Fantasy' } }, { genre: { name: 'Fiction' } }],
          bookSeries: [{ userPosition: '2', series: { __ref: 'Series:1' } }],
          details: { format: 'Paperback', numPages: 512, publisher: 'Example House', isbn13: '9780306406157', language: { name: 'English' } },
          work: { __ref: 'Work:1' },
        },
        'Contributor:1': { __typename: 'Contributor', name: 'A. Writer' },
        'Series:1': { __typename: 'Series', title: 'Tests' },
        'Work:1': { __typename: 'Work', details: { originalTitle: 'The Test', publicationTime: Date.UTC(1999, 0, 1) } },
      },
    },
  },
};
const page = `<!doctype html><html><head><title>x</title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;

describe('Goodreads bulk update', () => {
  it('picks books with a Goodreads link that were not updated yet', () => {
    const items = [
      book(),
      book({ id: 'b2' }, { goodreadsCheckedAt: '2026-01-01' }),
      book({ id: 'b3' }, { goodreadsUrl: undefined }),
      { ...book({ id: 'f1' }), type: 'fic' as const },
      book({ id: 'b4', deleted: true }),
    ];
    expect(updateCandidates(items).map((i) => i.id)).toEqual(['b1']);
    expect(updateCandidates(items, true).map((i) => i.id)).toEqual(['b1', 'b2']);
  });

  it('fills only empty fields and adds genres', async () => {
    const draft = parseGoodreadsPayload({
      s: 'gr',
      u: 'https://www.goodreads.com/book/show/42',
      st: nextData.props.pageProps.apolloState as never,
    });
    const names: string[] = [];
    const nameId = async (c: string, n: string) => {
      names.push(`${c}:${n}`);
      return `${c}-${n}`;
    };
    const { item, changed } = await fillFromDraft(book(), draft, nameId, '2026-09-24');
    expect(item.description).toBe('A *fine* book.');
    expect(item.coverUrl).toBe('https://images.example/cover.jpg');
    expect(item.language).toBe('en');
    expect(item.seriesId).toBe('series-Tests');
    expect(item.seriesNumber).toBe('2');
    expect(item.genreIds).toEqual(['g-mine', 'genres-Fantasy', 'genres-Fiction']);
    expect(item.book).toMatchObject({
      pageCount: 300, // already set: kept
      isbn13: '9780306406157',
      format: 'paperback',
      originalPublicationYear: 1999,
      publisherId: 'publishers-Example House',
      goodreadsCheckedAt: '2026-09-24',
    });
    // Existing authors, rating and title stay.
    expect(item.authorIds).toEqual(['a1']);
    expect(item.rating).toBe(4.5);
    expect(item.title).toBe('The Test');
    expect(names).not.toContain('authors:A. Writer');
    expect(changed).toEqual(expect.arrayContaining(['description', 'cover', 'genres', 'ISBN-13', 'publisher']));
    expect(changed).not.toContain('pages');

    const again = await fillFromDraft(item, draft, nameId, '2026-09-25');
    expect(again.changed).toEqual([]);
    expect(again.item.book?.goodreadsCheckedAt).toBe('2026-09-25');
  });

  it('bookmarklet fetches pages for the app tab', async () => {
    const code = decodeURIComponent(goodreadsUpdateBookmarklet(APP).replace(/^javascript:/, ''));
    const app = { closed: false, focus: vi.fn(), postMessage: vi.fn() };
    let listener: ((e: unknown) => void) | undefined;
    const win = {
      open: vi.fn(() => app),
      addEventListener: (type: string, fn: (e: unknown) => void) => type === 'message' && (listener = fn),
    };
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      url: 'https://www.goodreads.com' + url,
      text: async () => page,
    }));
    new Function('window', 'location', 'fetch', 'alert', code)(win, { origin: 'https://www.goodreads.com' }, fetchMock, vi.fn());
    expect(win.open).toHaveBeenCalledWith(APP + '#/import/goodreads-update', 'reading-log-goodreads');

    // Messages from other origins or windows are ignored.
    listener!({ origin: 'https://evil.example', source: app, data: { t: 'rl-fetch', id: '1' } });
    listener!({ origin: 'https://margof94.github.io', source: {}, data: { t: 'rl-fetch', id: '1' } });
    expect(fetchMock).not.toHaveBeenCalled();

    listener!({ origin: 'https://margof94.github.io', source: app, data: { t: 'rl-hello' } });
    expect(app.postMessage).toHaveBeenLastCalledWith({ t: 'rl-ready' }, 'https://margof94.github.io');

    listener!({ origin: 'https://margof94.github.io', source: app, data: { t: 'rl-fetch', id: '42' } });
    await vi.waitFor(() => expect(app.postMessage).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith('/book/show/42', { credentials: 'include' });
    const [msg, origin] = app.postMessage.mock.calls[1];
    expect(origin).toBe('https://margof94.github.io');
    expect(msg).toMatchObject({ t: 'rl-book', id: '42' });
    expect(parseGoodreadsPayload(msg.data).book?.isbn13).toBe('9780306406157');
  });

  it('bookmarklet refuses to run off Goodreads', () => {
    const code = decodeURIComponent(goodreadsUpdateBookmarklet(APP).replace(/^javascript:/, ''));
    const win = { open: vi.fn(), addEventListener: vi.fn() };
    const alertMock = vi.fn();
    new Function('window', 'location', 'fetch', 'alert', code)(win, { origin: 'https://example.com' }, vi.fn(), alertMock);
    expect(alertMock).toHaveBeenCalled();
    expect(win.open).not.toHaveBeenCalled();
  });
});
