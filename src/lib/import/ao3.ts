// AO3 work metadata from a saved work page, AO3's "Download → HTML" file, or the
// fragments sent by the AO3 bookmarklet. Label-driven so all three formats work.
import { AO3_LANGUAGE_CODES, LANGUAGES } from '../constants';
import type { ItemDraft } from '../drafts';
import { htmlToMarkdown, textOf } from '../html';
import type { Ao3Rating } from '../types';
import { today } from '../util';

const RATINGS: Record<string, Ao3Rating> = {
  'general audiences': 'general',
  'teen and up audiences': 'teen',
  mature: 'mature',
  explicit: 'explicit',
  'not rated': 'not-rated',
};

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));

function num(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text.replace(/[^\d]/g, ''));
  return text.trim() && Number.isFinite(n) ? n : undefined;
}

function values(dd: Element): string[] {
  const links = [...dd.querySelectorAll('a')].map(textOf).filter(Boolean);
  if (links.length) return links;
  return textOf(dd)
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function workUrl(id: string): string {
  return `https://archiveofourown.org/works/${id}`;
}

function findWorkId(doc: Document, hint?: string): string | undefined {
  const candidates = [
    hint,
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    ...[...doc.querySelectorAll('a[href*="/works/"]')].map((a) => a.getAttribute('href')),
  ];
  for (const c of candidates) {
    const m = c?.match(/archiveofourown\.org\/(?:collections\/[^/]+\/)?works\/(\d+)/) ?? c?.match(/^\/works\/(\d+)/);
    if (m) return m[1];
  }
  return undefined;
}

export function isAo3Document(doc: Document): boolean {
  return !!doc.querySelector('dl.work.meta') || /Archive of Our Own/i.test(textOf(doc.querySelector('#preface .message, title')));
}

/** Parses a work page / download file. Throws if no work details are found. */
export function parseAo3Document(doc: Document, urlHint?: string): ItemDraft {
  const meta = doc.querySelector('dl.work.meta') ?? doc.querySelector('#preface dl.tags, .meta dl.tags, dl.tags');
  if (!meta) throw new Error('No AO3 fic details found. Use the fic’s own page (with tags and stats) or AO3’s Download → HTML file.');

  const fic: NonNullable<ItemDraft['fic']> = {
    site: 'ao3',
    warnings: [],
    categories: [],
    fandoms: [],
    relationships: [],
    characters: [],
    additionalTags: [],
    complete: false,
    statsDate: today(),
  };
  const draft: ItemDraft = { type: 'fic', source: 'AO3', fic };
  let stats = '';

  for (const dt of meta.querySelectorAll(':scope > dt')) {
    const dd = dt.nextElementSibling;
    if (!dd || dd.tagName !== 'DD') continue;
    const label = textOf(dt).replace(/:$/, '').toLowerCase();
    if (/^ratings?$/.test(label)) fic.rating = RATINGS[values(dd)[0]?.toLowerCase() ?? ''];
    else if (/^archive warnings?$/.test(label)) fic.warnings = values(dd);
    else if (/^categor/.test(label)) fic.categories = values(dd);
    else if (/^fandoms?$/.test(label)) fic.fandoms = values(dd);
    else if (/^relationships?$/.test(label)) fic.relationships = values(dd);
    else if (/^characters?$/.test(label)) fic.characters = values(dd);
    else if (/^additional tags?$/.test(label)) fic.additionalTags = values(dd);
    else if (/^language$/.test(label)) {
      const attr = dd.getAttribute('lang')?.slice(0, 2).toLowerCase();
      draft.language = attr && LANG_CODES.has(attr) ? attr : AO3_LANGUAGE_CODES[textOf(dd).toLowerCase()];
    } else if (/^series$/.test(label)) {
      const pos = textOf(dd.querySelector('.position')) || textOf(dd);
      const m = pos.match(/Part\s+(\d+)\s+of\s+(.+?)(?:,\s*Part\s+\d+\s+of\s+.*)?$/i);
      if (m) {
        draft.seriesNumber = m[1];
        draft.series = m[2].replace(/\s*(?:[←→«»]|Previous Work|Next Work).*$/i, '').trim();
      }
    } else if (/^stats$/.test(label)) stats = textOf(dd);
  }

  // "Published: 2026-09-04 Updated: 2026-09-19 Words: 25,473 Chapters: 3/? …"
  const date = (name: string) => stats.match(new RegExp(`${name}:\\s*(\\d{4}-\\d{2}-\\d{2})`))?.[1];
  const count = (name: string) => num(stats.match(new RegExp(`${name}:\\s*([\\d,]+)`))?.[1]);
  fic.publishedDate = date('Published');
  fic.updatedDate = date('Updated');
  fic.completedDate = date('Completed');
  draft.wordCount = count('Words');
  const ch = stats.match(/Chapters:\s*(\d+)\s*\/\s*(\d+|\?)/);
  if (ch) {
    fic.chaptersAvailable = Number(ch[1]);
    fic.chaptersTotal = ch[2] === '?' ? undefined : Number(ch[2]);
  }
  fic.complete =
    !!fic.completedDate || (fic.chaptersTotal !== undefined && fic.chaptersAvailable === fic.chaptersTotal);
  fic.kudos = count('Kudos');
  fic.hits = count('Hits');
  fic.bookmarks = count('Bookmarks');
  fic.comments = count('Comments');

  // Title, authors, summary.
  draft.title =
    textOf(doc.querySelector('.preface h2.title, h2.title.heading')) ||
    textOf(doc.querySelector('#preface .meta h1, #preface h1, .meta h1')) ||
    textOf(doc.querySelector('#preface .message b')) ||
    textOf(doc.querySelector('title')).split(' - ')[0].replace(/\s*\[Archive of Our Own\]$/, '');

  const byline = doc.querySelectorAll('.byline a[rel="author"]');
  const authorLinks = byline.length ? byline : doc.querySelectorAll('a[rel="author"]');
  const authors = [...new Set([...authorLinks].map(textOf))].filter(Boolean);
  if (!authors.length) {
    const text = textOf(doc.querySelector('.preface .byline, #preface .byline, .byline'));
    if (text) authors.push(text.replace(/^by\s+/i, ''));
  }
  draft.authors = authors;

  let summary = doc.querySelector('.preface .summary blockquote.userstuff, .summary blockquote');
  if (!summary) {
    const label = [...doc.querySelectorAll('#preface p, .meta p')].find((p) => textOf(p) === 'Summary');
    const next = label?.nextElementSibling;
    if (next?.tagName === 'BLOCKQUOTE') summary = next;
  }
  if (summary) draft.description = htmlToMarkdown(summary);

  const id = findWorkId(doc, urlHint);
  if (id) {
    fic.workId = id;
    fic.url = workUrl(id);
  }
  return draft;
}

export function parseAo3Html(html: string, urlHint?: string): ItemDraft {
  return parseAo3Document(new DOMParser().parseFromString(html, 'text/html'), urlHint);
}

/**
 * Runs on archiveofourown.org inside the bookmarklet (via Function.toString),
 * so it must stay self-contained: no imports, no outside helpers.
 */
export function collectAo3(doc: Document, href: string): Record<string, unknown> | string {
  const meta = doc.querySelector('dl.work.meta');
  if (!/archiveofourown\.org/.test(href) || !meta) {
    return 'Open a fic on archiveofourown.org first (the page that shows its tags and stats).';
  }
  const parts = [meta, doc.querySelector('#workskin > .preface')].filter(Boolean) as Element[];
  const html = parts
    .map((node) => {
      const copy = node.cloneNode(true) as Element;
      copy.querySelectorAll('a').forEach((a) => {
        if (a.getAttribute('rel') !== 'author') a.removeAttribute('href');
      });
      copy.querySelectorAll('.notes, .endnotes, .jump, .associations').forEach((n) => n.remove());
      return copy.outerHTML;
    })
    .join('');
  return { s: 'ao3', u: href, h: html };
}
