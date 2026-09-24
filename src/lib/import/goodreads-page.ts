// A Goodreads book page → draft. The page data comes from the bookmarklet
// (collectGoodreads runs on goodreads.com) or from a saved page file.
import { LANGUAGES } from '../constants';
import type { ItemDraft } from '../drafts';
import { htmlToMarkdown } from '../html';
import { parseIsbn } from '../isbn';
import { mapBinding } from './goodreads-csv';

export interface GoodreadsPayload {
  s: 'gr';
  u: string;
  ld?: string | null;
  img?: string | null;
  st?: Record<string, Record<string, unknown>>;
}

/**
 * Runs on goodreads.com inside the bookmarklet (via Function.toString), so it
 * must stay self-contained: no imports, no outside helpers.
 * Keeps only what the app needs from the page's Next.js data.
 */
export function collectGoodreads(doc: Document, href: string): Record<string, unknown> | string {
  if (!/goodreads\.com\/(?:[a-z]+\/)?book\/show\/\d+/.test(href)) return 'Open a book page on goodreads.com first.';
  const out: Record<string, unknown> = { s: 'gr', u: href.split(/[?#]/)[0] };
  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) out.ld = ld.textContent;
  const og = doc.querySelector('meta[property="og:image"]');
  if (og) out.img = og.getAttribute('content');
  const next = doc.getElementById('__NEXT_DATA__');
  if (next) {
    try {
      const st = JSON.parse(next.textContent || '{}').props.pageProps.apolloState || {};
      const id = (href.match(/show\/(\d+)/) || [])[1];
      const keep: Record<string, unknown> = {};
      let book = '';
      for (const k of Object.keys(st)) {
        const v = st[k];
        const t = v && v.__typename;
        if (t === 'Book' && v.details) {
          if (String(v.legacyId) === id) book = k;
          else if (!book) book = k;
        } else if (t === 'Contributor') keep[k] = { __typename: t, name: v.name };
        else if (t === 'Series') keep[k] = { __typename: t, title: v.title };
        else if (t === 'Work')
          keep[k] = {
            __typename: t,
            details: v.details ? { originalTitle: v.details.originalTitle, publicationTime: v.details.publicationTime } : null,
          };
      }
      if (book) keep[book] = st[book];
      out.st = keep;
    } catch {
      /* page structure changed: fall back to the ld+json data */
    }
  }
  return out;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | undefined => (v && typeof v === 'object' ? (v as Obj) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function languageCode(name: unknown): string | undefined {
  const n = str(name)?.toLowerCase();
  if (!n) return undefined;
  return LANGUAGES.find((l) => l.name.toLowerCase() === n || l.code === n)?.code;
}

function msToDate(ms: unknown): string | undefined {
  if (typeof ms !== 'number') return undefined;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

export function parseGoodreadsPayload(p: GoodreadsPayload): ItemDraft {
  const draft: ItemDraft = { type: 'book', source: 'Goodreads', book: {} };
  const book = draft.book!;
  const id = p.u.match(/show\/(\d+)/)?.[1];
  book.goodreadsUrl = id ? `https://www.goodreads.com/book/show/${id}` : p.u;

  const st = p.st ?? {};
  const ref = (v: unknown) => {
    const r = asObj(v)?.__ref;
    return typeof r === 'string' ? asObj(st[r]) : undefined;
  };
  const b = Object.values(st).find((v) => v.__typename === 'Book');

  if (b) {
    draft.title = str(b.title);
    const edges = [b.primaryContributorEdge, ...((b.secondaryContributorEdges as unknown[]) ?? [])];
    draft.authors = edges
      .map(asObj)
      .filter((e, i) => e && (i === 0 || !e.role || e.role === 'Author'))
      .map((e) => str(ref(e!.node)?.name))
      .filter((n): n is string => !!n);
    const desc = str(b.description) ?? str(b['description({"stripped":true})']);
    if (desc) draft.description = htmlToMarkdown(desc);
    draft.coverUrl = str(b.imageUrl);
    draft.genres = ((b.bookGenres as unknown[]) ?? [])
      .map((g) => str(asObj(asObj(g)?.genre)?.name))
      .filter((n): n is string => !!n)
      .slice(0, 3);
    const series = asObj(((b.bookSeries as unknown[]) ?? [])[0]);
    if (series) {
      draft.series = str(ref(series.series)?.title);
      draft.seriesNumber = str(series.userPosition);
    }
    const d = asObj(b.details) ?? {};
    book.format = mapBinding(str(d.format) ?? '');
    if (typeof d.numPages === 'number' && d.numPages > 0 && book.format !== 'audiobook') book.pageCount = d.numPages;
    book.publicationDate = msToDate(d.publicationTime);
    book.publisher = str(d.publisher);
    const isbn = parseIsbn(str(d.isbn13) ?? '') ?? parseIsbn(str(d.isbn) ?? '');
    if (isbn) Object.assign(book, isbn);
    draft.language = languageCode(asObj(d.language)?.name);
    const work = asObj(ref(b.work)?.details);
    const original = str(work?.originalTitle);
    if (original && original !== draft.title) draft.originalTitle = original;
    const year = msToDate(work?.publicationTime)?.slice(0, 4);
    if (year) book.originalPublicationYear = Number(year);
  }

  // Fallback / gaps: schema.org data embedded in the page.
  if (p.ld) {
    try {
      const ld = JSON.parse(p.ld) as Obj;
      draft.title ??= str(ld.name);
      if (!draft.authors?.length) {
        const a = Array.isArray(ld.author) ? ld.author : [ld.author];
        draft.authors = a.map((x) => str(asObj(x)?.name)).filter((n): n is string => !!n);
      }
      if (!book.isbn13) {
        const isbn = parseIsbn(str(ld.isbn) ?? '');
        if (isbn) Object.assign(book, isbn);
      }
      if (!book.pageCount && typeof ld.numberOfPages === 'number') book.pageCount = ld.numberOfPages;
      book.format ??= mapBinding(str(ld.bookFormat) ?? '');
      draft.language ??= languageCode(ld.inLanguage);
      draft.coverUrl ??= str(ld.image);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  draft.coverUrl ??= str(p.img);
  if (!draft.title) throw new Error('Couldn’t read the book details from this Goodreads page.');
  // Goodreads titles sometimes still carry the series: "Title (Series, #2)".
  draft.title = draft.title.replace(/\s*\([^()]*#\s*[\d.]+\)\s*$/, '');
  return draft;
}

export function isGoodreadsDocument(doc: Document): boolean {
  return (
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') === 'Goodreads' ||
    /goodreads\.com\/book\/show\//.test(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '')
  );
}

/** For a saved Goodreads page file. */
export function parseGoodreadsDocument(doc: Document): ItemDraft {
  const url =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
    '';
  const payload = collectGoodreads(doc, url);
  if (typeof payload === 'string') throw new Error('This saved page doesn’t look like a Goodreads book page.');
  return parseGoodreadsPayload(payload as unknown as GoodreadsPayload);
}
