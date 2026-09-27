// Amazon product pages (amazon.co.jp first, other stores work the same way).
// The app can't fetch Amazon itself (browsers block it and Amazon blocks
// robots), so details come from the Amazon bookmarklet or a saved page; a
// pasted link or ASIN is turned into an ISBN or a title search instead.
import type { ItemDraft } from '../drafts';
import { htmlToMarkdown } from '../html';
import { parseIsbn } from '../isbn';
import type { BookFormat } from '../types';

export interface AmazonPayload {
  s: 'amz';
  u: string; // page URL
  asin?: string;
  t?: string; // product title
  a?: [string, string][]; // [name, role]
  img?: string;
  d?: string; // description HTML
  det?: Record<string, string>; // product details, label → value
  fmt?: string; // format / binding text
  crumbs?: string; // category breadcrumbs
  series?: string;
}

/**
 * Runs on the Amazon page inside the bookmarklet (via Function.toString), so it
 * must stay self-contained: no imports, no outside helpers. Handles the desktop
 * and mobile layouts.
 */
export function collectAmazon(doc: Document, href: string): Record<string, unknown> | string {
  if (!/amazon\.[a-z.]+\//.test(href)) return 'Open a book page on Amazon first.';
  const clean = (s: string | null | undefined) => (s || '').replace(/[‎‏ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = (sel: string) => doc.querySelector(sel);
  const text = (sel: string) => clean(q(sel)?.textContent);
  const out: Record<string, unknown> = { s: 'amz', u: href.split(/[?#]/)[0] };
  const asin =
    (href.match(/\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Z0-9]{10})/i) || [])[1] ||
    (q('input#ASIN, input[name="ASIN"]') as HTMLInputElement | null)?.value;
  if (asin) out.asin = asin.toUpperCase();
  out.t = text('#productTitle') || text('#title') || clean(q('meta[name="title"]')?.getAttribute('content'));
  if (!out.t) return 'Couldn’t find a book on this page. Open the book’s own page (not search results) and try again.';

  const authors: [string, string][] = [];
  doc.querySelectorAll('#bylineInfo .author, #bylineInfo_feature_div .author').forEach((el) => {
    const name = clean(el.querySelector('a')?.textContent);
    const role = clean(el.querySelector('.contribution')?.textContent).replace(/[(),（）]/g, '');
    if (name && !authors.some((x) => x[0] === name)) authors.push([name, role]);
  });
  out.a = authors;

  const img = q('#landingImage, #ebooksImgBlkFront, #imgBlkFront, #main-image, #ebooksImgBlkFront img, #imgTagWrapperId img, #main-image-container img') as HTMLImageElement | null;
  let src = img?.getAttribute('data-old-hires') || img?.getAttribute('data-a-hires') || '';
  const dyn = img?.getAttribute('data-a-dynamic-image');
  if (!src && dyn) {
    try {
      const sizes = JSON.parse(dyn) as Record<string, number[]>;
      src = Object.keys(sizes).sort((x, y) => sizes[y][0] - sizes[x][0])[0] || '';
    } catch {
      /* ignore */
    }
  }
  out.img = src || img?.getAttribute('src') || undefined;

  const desc = q('#bookDescription_feature_div .a-expander-content, #bookDescription_feature_div noscript, #bookDescription_feature_div, #productDescription');
  if (desc) out.d = (desc.innerHTML || '').slice(0, 8000);

  const det: Record<string, string> = {};
  const put = (label: string | null | undefined, value: string | null | undefined) => {
    const l = clean(label).replace(/\s*[:：]\s*$/, '').trim();
    const v = clean(value);
    if (l && v && !(l in det)) det[l] = v;
  };
  doc.querySelectorAll('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li').forEach((li) => {
    const bold = li.querySelector('.a-text-bold');
    if (bold) put(bold.textContent, clean(li.textContent).slice(clean(bold.textContent).length));
  });
  doc.querySelectorAll('[id^="rpi-attribute-"]').forEach((el) => {
    put(el.querySelector('.rpi-attribute-label')?.textContent, el.querySelector('.rpi-attribute-value')?.textContent);
  });
  doc.querySelectorAll('#productDetailsTable li, table.prodDetTable tr, #productDetails_detailBullets_sections1 tr').forEach((row) => {
    const th = row.querySelector('th, b');
    if (th) put(th.textContent, clean(row.textContent).slice(clean(th.textContent).length));
  });
  out.det = det;

  out.fmt =
    text('#tmmSwatches .selected .slot-title, #tmmSwatches .selected .a-button-text span') ||
    text('#productSubtitle') ||
    text('#productBinding') ||
    text('#formats .selected');
  out.crumbs = text('#wayfinding-breadcrumbs_feature_div') || text('#nav-subnav');
  out.series = text('#seriesBulletWidget_feature_div a') || text('#seriesTitle_feature_div a') || undefined;
  return out;
}

// ---- turning the page data into a draft ------------------------------------------------

const LANG: Record<string, string> = {
  日本語: 'ja', japanese: 'ja', 英語: 'en', english: 'en', ロシア語: 'ru', russian: 'ru', 中国語: 'zh', 韓国語: 'ko',
};

/** Label lookup across Japanese and English detail names. */
function detail(det: Record<string, string>, ...names: string[]): string | undefined {
  for (const [k, v] of Object.entries(det)) {
    const key = k.toLowerCase();
    if (names.some((n) => key === n || key.startsWith(n))) return v;
  }
  return undefined;
}

/** "2018/5/1", "2018年5月1日", "May 1, 2018" → "2018-05-01". */
export function amazonDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let m = s.match(/(\d{4})\s*[/年.-]\s*(\d{1,2})\s*[/月.-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s.replace(/\(.*?\)/g, ''));
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) return d.toISOString().slice(0, 10);
  m = s.match(/(\d{4})\s*[/年.-]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : undefined;
}

/** Big image: drop Amazon's size suffix ("…/81abc._SY466_.jpg" → "…/81abc.jpg"). */
export function amazonImage(url: string | undefined): string | undefined {
  if (!url || !/^https:\/\//.test(url) || url.startsWith('data:')) return undefined;
  return url.replace(/\._[^/]*_\.(jpe?g|png|gif)$/i, '.$1');
}

function amazonFormat(fmt: string, crumbs: string, title: string): BookFormat | undefined {
  const all = `${fmt} ${crumbs} ${title}`;
  if (/コミック|マンガ|漫画|comics?\b|manga/i.test(all) && !/文庫|小説|novel/i.test(fmt)) return 'manga';
  if (/audible|オーディオ|audio/i.test(fmt)) return 'audiobook';
  if (/kindle|電子書籍|ebook/i.test(fmt)) return 'ebook';
  if (/ハードカバー|hardcover/i.test(fmt)) return 'hardcover';
  if (/文庫|新書|単行本|ソフトカバー|ペーパーバック|paperback|tankobon/i.test(fmt)) return 'paperback';
  return undefined;
}

const VOLUME: Record<string, number> = { 上: 1, 中: 2 };

/**
 * "【電子限定おまけ付き】 カラーレシピ 上 (ディアプラス・コミックス)" →
 * title "カラーレシピ 上", imprint "ディアプラス・コミックス", volume "1" of series "カラーレシピ".
 */
export function splitAmazonTitle(raw: string, seriesHint?: string): { title: string; series?: string; number?: string } {
  let title = raw.replace(/【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim();
  // Trailing brackets name the imprint ("(ディアプラス・コミックス)", "(文春文庫 む 16-1)") unless they hold a volume.
  for (let m; (m = title.match(/^(.+?)\s*[(（]([^()（）]*)[)）]$/)) && !/^\s*(\d+|上|中|下)\s*$/.test(m[2]); ) title = m[1].trim();
  const series = seriesHint?.replace(/\s*[(（]全?\s*\d+\s*巻?[)）]\s*$/, '').trim() || undefined;
  const m = title.match(/^(.*?)(?:[\s　]*第?\s*(\d+)\s*巻|[\s　]*[(（](\d+|上|中|下)[)）]|[\s　]+(\d+|上|中|下))$/);
  if (!m || !m[1].trim()) return { title, series };
  const base = m[1].trim();
  const vol = m[2] ?? m[3] ?? m[4];
  const total = Number(seriesHint?.match(/全\s*(\d+)\s*巻/)?.[1] ?? 0);
  const number = /^\d+$/.test(vol) ? String(Number(vol)) : vol === '下' ? String(total || 2) : String(VOLUME[vol]);
  return { title, series: series ?? base, number };
}

// Author roles that are part of the work (writers and manga artists), not translators or cover artists.
const AUTHOR_ROLE = /^$|著|作|原作|漫画|まんが|画|author|writer|story|art/i;
const NOT_AUTHOR = /翻訳|訳|イラスト|挿絵|カバー|解説|編集|translator|illustrator|editor|cover|narrator|ナレーター/i;

export function parseAmazonPayload(p: AmazonPayload): ItemDraft {
  const det = p.det ?? {};
  const t = p.t?.trim();
  if (!t) throw new Error('Couldn’t read the book details from this Amazon page.');
  const split = splitAmazonTitle(t, p.series);
  const draft: ItemDraft = { type: 'book', source: 'Amazon', title: split.title, book: {} };
  const book = draft.book!;
  if (split.series) {
    draft.series = split.series;
    draft.seriesNumber = split.number;
  }
  draft.authors = (p.a ?? []).filter(([, role]) => AUTHOR_ROLE.test(role) && !NOT_AUTHOR.test(role)).map(([n]) => n.replace(/\s+/g, ' '));
  if (!draft.authors.length && p.a?.length) draft.authors = [p.a[0][0]];
  const cover = amazonImage(p.img);
  if (cover) draft.coverUrl = cover;
  if (p.d) {
    const md = htmlToMarkdown(p.d).trim();
    if (md) draft.description = md;
  }

  const publisherLine = detail(det, '出版社', 'publisher');
  if (publisherLine) {
    const name = publisherLine.replace(/[;；].*$/, '').replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();
    if (name) book.publisher = name;
  }
  book.publicationDate = amazonDate(detail(det, '発売日', '出版日', 'publication date')) ?? amazonDate(publisherLine);
  const pages = detail(det, '本の長さ', 'ページ数', 'print length', 'paperback', 'hardcover', '単行本', '文庫', 'コミック', 'tankobon');
  const n = pages?.match(/(\d[\d,]*)\s*(?:ページ|pages?)/i)?.[1];
  if (n) book.pageCount = Number(n.replace(/,/g, ''));
  const isbn = parseIsbn(detail(det, 'isbn-13') ?? '') ?? parseIsbn(detail(det, 'isbn-10') ?? '');
  if (isbn) Object.assign(book, isbn);
  else if (p.asin && !/kindle|電子書籍/i.test(p.fmt ?? '')) {
    const fromAsin = parseIsbn(p.asin); // print editions use the ISBN-10 as ASIN
    if (fromAsin) Object.assign(book, fromAsin);
  }
  const lang = detail(det, '言語', 'language')?.toLowerCase().trim();
  draft.language = (lang && (LANG[lang] ?? LANG[lang.split(/\s/)[0]])) ?? (/amazon\.co\.jp/.test(p.u) ? 'ja' : undefined);
  book.format = amazonFormat(p.fmt ?? '', p.crumbs ?? '', t);
  return draft;
}

// ---- pasted links and ASINs -------------------------------------------------------------

export interface AmazonRef {
  asin?: string;
  isbn13?: string; // print books: the ASIN is the ISBN-10
  query?: string; // title words from the link, for a search
}

/** An Amazon link or a bare ASIN, or undefined if the text is neither. */
export function parseAmazonRef(input: string): AmazonRef | undefined {
  const s = input.trim();
  if (/^B0[A-Z0-9]{8}$/i.test(s)) return { asin: s.toUpperCase() };
  if (/^\d{9}[\dX]$/i.test(s)) return undefined; // an ISBN-10: handled as an ISBN
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return undefined;
  }
  if (!/(^|\.)amazon\.[a-z.]+$|^amzn\.(to|asia)$|^a\.co$/i.test(url.hostname)) return undefined;
  const path = decodeURIComponent(url.pathname);
  const asin = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|o\/ASIN)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
  const slug = path.match(/^\/([^/]+)\/dp\//)?.[1];
  // Words in the link that name the format rather than the book.
  const IMPRINT_WORD = /コミックス|comics|comix|文庫|ノベルズ|ブックス|books$/i; // "ディアプラス・コミックス"
  const FORMAT_WORD = /^(ebook|kindle|paperback|hardcover|audible|audiobook|kindle版|電子書籍|コミック|文庫|単行本|新書)$/i;
  const query = slug
    ?.split(/[-_\s]+/)
    .filter((w) => w && !FORMAT_WORD.test(w) && !IMPRINT_WORD.test(w))
    .join(' ');
  const ref: AmazonRef = { asin, query: query || undefined };
  const fromAsin = asin ? parseIsbn(asin) : null; // print editions use the ISBN-10 as ASIN
  if (fromAsin) ref.isbn13 = fromAsin.isbn13;
  return ref;
}
