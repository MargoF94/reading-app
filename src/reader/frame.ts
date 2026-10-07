// Runs inside reader-frame.html: shows the EPUB with foliate-js and talks to the
// reader page (its parent) with messages. The frame's Content Security Policy
// stops any scripts inside the book from running.
import { View, type RelocateDetail, type SearchResult, type TocItem } from 'foliate-js/view.js';
import { isJapanese, readerCss, sentenceAt, THEME_COLORS, type FromFrame, type ReaderPrefs, type TocEntry, type ToFrame } from '../lib/reader';

const post = (m: FromFrame) => parent.postMessage(m, location.origin);

let view: View | null = null;
let file: File | null = null;
let prefs: ReaderPrefs | null = null;
let lang = '';

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return String(Object.values(v)[0] ?? '');
  return '';
}

let wanted: ReaderPrefs | null = null; // latest settings, applied once the book is open

function applyPrefs(p: ReaderPrefs) {
  wanted = p;
  // While a book is still opening, open() applies the latest settings when it's ready.
  if (!view?.renderer) return;
  const before = prefs;
  prefs = p;
  document.body.style.background = THEME_COLORS[p.theme].bg;
  view.style.background = THEME_COLORS[p.theme].bg;
  // Side margins as padding around the book: the renderer's own gap runs along the
  // lines, which for vertical Japanese text would be top and bottom instead.
  view.style.boxSizing = 'border-box';
  view.style.padding = `0 ${p.margin}%`;
  const r = view.renderer;
  r.setAttribute('flow', p.layout === 'scroll' ? 'scrolled' : 'paginated');
  r.setAttribute('gap', '4%');
  r.setAttribute('margin', '44px');
  r.setAttribute('max-inline-size', '760px');
  // Changing the text direction needs the page laid out again from scratch.
  if (before && before.writing !== p.writing && isJapanese(lang) && file) {
    void open(file, view.lastLocation?.cfi, p);
    return;
  }
  r.setStyles(readerCss(p, lang));
}

function flatten(items: TocItem[] | undefined, depth = 0, out: TocEntry[] = []): TocEntry[] {
  for (const t of items ?? []) {
    if (t.href) out.push({ label: (t.label ?? '').trim() || 'Untitled', href: t.href, depth });
    flatten(t.subitems, depth + 1, out);
  }
  return out;
}

async function open(f: File, cfi: string | undefined, p: ReaderPrefs) {
  wanted = p;
  view?.close();
  view?.remove();
  file = f;
  const v = document.createElement('foliate-view') as View;
  view = v;
  document.body.append(v);
  try {
    await v.open(f);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    return;
  }
  const { book } = v;
  const language = book.metadata?.language;
  lang = (Array.isArray(language) ? language[0] : language) ?? '';
  if (view !== v) return; // another book (or the same one, re-laid out) was opened meanwhile
  prefs = null;
  applyPrefs(wanted ?? p);

  v.addEventListener('load', (e) => {
    const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
    onLoad(doc, index);
  });
  v.addEventListener('relocate', (e) => onRelocate((e as CustomEvent<RelocateDetail>).detail));
  // Links to other websites open outside the reader.
  v.addEventListener('external-link', (e) => {
    e.preventDefault();
    const href = (e as CustomEvent<{ href: string }>).detail.href;
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  });

  const fractions = v.getSectionFractions();
  const toc = flatten(book.toc).map((t) => {
    try {
      const idx = book.resolveHref(t.href)?.index;
      return idx === undefined ? t : { ...t, fraction: fractions[idx] };
    } catch {
      return t;
    }
  });
  post({ type: 'opened', title: textOf(book.metadata?.title), language: lang || undefined, toc, rtl: book.dir === 'rtl' });
  await v.init({ lastLocation: cfi, showTextStart: !cfi });
}

let selectionTimer: ReturnType<typeof setTimeout> | undefined;
let hadSelection = false;

/** Tells the reader page what is selected, with its place in the book and its sentence. */
function reportSelection(doc: Document, index: number) {
  const sel = doc.getSelection();
  const text = sel && !sel.isCollapsed && sel.rangeCount ? sel.toString().trim() : '';
  if (!text) {
    if (hadSelection) post({ type: 'selection', text: '' });
    hadSelection = false;
    return;
  }
  hadSelection = true;
  const range = sel!.getRangeAt(0);
  let cfi: string | undefined;
  try {
    cfi = view?.getCFI(index, range);
  } catch {
    cfi = undefined;
  }
  // The sentence: the selection's paragraph, cut at sentence ends around it.
  let sentence: string | undefined;
  const node = range.startContainer;
  const block = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(
    'p, li, blockquote, dd, dt, td, h1, h2, h3, h4, h5, h6, div',
  );
  if (block) {
    const before = doc.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    sentence = sentenceAt(block.textContent ?? '', start, start + range.toString().length);
  }
  post({ type: 'selection', text: text.slice(0, 5000), cfi, sentence });
}

/** Left third turns back (forward in right-to-left books), right third the other way, middle shows the controls. */
function tapAt(x: number) {
  const third = window.innerWidth / 3;
  if (prefs?.layout !== 'scroll' && x < third) void view?.goLeft();
  else if (prefs?.layout !== 'scroll' && x > third * 2) void view?.goRight();
  else post({ type: 'tap' });
}

function onLoad(doc: Document, index: number) {
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => reportSelection(doc, index), 250);
  });
  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented || (e.target as Element)?.closest?.('a[href]')) return;
    if (!doc.getSelection()?.isCollapsed) return;
    // A tap that only clears a selection doesn't also turn the page.
    if (hadSelection) {
      hadSelection = false;
      clearTimeout(selectionTimer);
      post({ type: 'selection', text: '' });
      return;
    }
    // Where the tap was on screen: the page's frame may be scrolled inside the renderer.
    const frame = doc.defaultView?.frameElement;
    tapAt((frame?.getBoundingClientRect().left ?? 0) + e.clientX);
  });
}

// Taps in the margins around the book.
document.addEventListener('click', (e) => tapAt(e.clientX));

function onRelocate(d: RelocateDetail) {
  const r = view?.renderer;
  const paged = prefs?.layout !== 'scroll' && r && r.pages > 2;
  post({
    type: 'relocate',
    fraction: d.fraction,
    cfi: d.cfi,
    chapter: d.tocItem?.label?.trim() || undefined,
    chapterHref: d.tocItem?.href,
    // The renderer adds a blank page before and after each chapter.
    page: paged ? Math.min(Math.max(r.page, 1), r.pages - 2) : undefined,
    pages: paged ? r.pages - 2 : undefined,
  });
}

function onKey(e: KeyboardEvent) {
  if (!view) return;
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') void view.goLeft();
  else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') void view.goRight();
  else if (e.key === 'Escape') post({ type: 'key', key: e.key });
  else return;
  e.preventDefault();
}

let searchRun = 0;
async function search(query: string) {
  if (!view) return;
  const run = ++searchRun;
  let total = 0;
  try {
    for await (const r of view.search({ query }) as AsyncGenerator<SearchResult | 'done'>) {
      if (run !== searchRun) return;
      if (r === 'done') break;
      if (!r.subitems?.length) continue;
      const hits = r.subitems.slice(0, 200 - total).map((s) => ({ cfi: s.cfi, chapter: r.label ?? '', ...s.excerpt }));
      total += hits.length;
      post({ type: 'search-hits', hits });
      if (total >= 200) break;
    }
  } catch (err) {
    console.error(err);
  }
  if (run === searchRun) post({ type: 'search-done', total });
}

addEventListener('keydown', onKey);
addEventListener('message', (e: MessageEvent<ToFrame>) => {
  if (e.source !== parent || e.origin !== location.origin) return;
  const m = e.data;
  switch (m.type) {
    case 'open':
      void open(m.file, m.cfi, m.prefs);
      break;
    case 'prefs':
      applyPrefs(m.prefs);
      break;
    case 'goto':
      void view?.goTo(m.target);
      break;
    case 'fraction':
      void view?.goToFraction(m.fraction);
      break;
    case 'turn':
      if (m.dir === 'left') void view?.goLeft();
      else if (m.dir === 'right') void view?.goRight();
      else if (m.dir === 'next') void view?.next();
      else void view?.prev();
      break;
    case 'search':
      void search(m.query);
      break;
    case 'deselect':
      view?.deselect();
      break;
    case 'clear-search':
      searchRun++;
      view?.clearSearch();
      break;
  }
});

post({ type: 'ready' });
