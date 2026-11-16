// AO3 works saved as HTML (AO3's own "Download → HTML", or the work's page saved from a
// browser, a Wayback Machine copy included) made into an EPUB laid out like AO3's EPUBs:
// a preface with the tags, summary and notes, a page for each chapter with its notes, and
// the end notes. The preface keeps AO3's markup, so the app reads the details back from it.
import { strToU8 } from 'fflate';
import { zipEpub } from '../epubCover';
import type { ItemDraft } from '../drafts';
import { hash } from '../placeholderCover';
import { isAo3Document, parseAo3Document } from './ao3';

const XHTML = 'http://www.w3.org/1999/xhtml';
const AO3 = 'https://archiveofourown.org/';

export interface Ao3Chapter {
  title: string;
  nodes: Node[];
}

export interface Ao3Work {
  draft: ItemDraft;
  title: string;
  authors: string[];
  language: string;
  url?: string;
  preface: Node[];
  chapters: Ao3Chapter[];
  afterword: Node[];
}

const text = (n: Node | null | undefined) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** "https://web.archive.org/web/20210801225335/https://archiveofourown.org/works/1" → the AO3 address. */
export function originalUrl(href: string): string {
  const m = href.match(/^(?:https?:)?\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.+)$/i) ?? href.match(/^\/web\/\d+[a-z_]*\/(.+)$/i);
  const url = m ? m[1] : href;
  if (/^(https?:|mailto:|#)/i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return AO3 + url.slice(1);
  return url;
}

/** Everything that isn't the work itself: scripts, buttons, page furniture, screen-reader labels. */
const DROP =
  'script, style, link, meta, noscript, iframe, object, embed, form, input, button, select, textarea, nav, ' +
  '.landmark, .actions, #feedback, .kudos, .toc-heading, #wm-ipp-base, #wm-ipp-print, #donato';

/** A copy of the node, cleaned for an EPUB. */
function cleaned(node: Node): Node {
  const copy = node.cloneNode(true);
  if (!(copy instanceof Element)) return copy;
  for (const el of copy.querySelectorAll(DROP)) el.remove();
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || a.name === 'srcset' || a.name.includes(':')) el.removeAttribute(a.name);
    }
    const href = el.getAttribute('href');
    if (href !== null) {
      if (/^\s*javascript:/i.test(href)) el.removeAttribute('href');
      else el.setAttribute('href', originalUrl(href.trim()));
    }
  }
  // Pictures stay on the web: a link to each, so the book needs nothing from the internet.
  for (const img of copy.querySelectorAll('img')) {
    const a = copy.ownerDocument.createElement('a');
    a.setAttribute('href', originalUrl(img.getAttribute('src') ?? ''));
    a.textContent = `[Image${img.getAttribute('alt') ? `: ${img.getAttribute('alt')}` : ''}]`;
    img.replaceWith(a);
  }
  return copy;
}

const elements = (parent: Element | null | undefined): Element[] => (parent ? [...parent.children] : []);

/** AO3's own first line: the title, and where the work was posted. */
function postedAt(doc: Document, title: string, url: string): Element {
  const p = doc.createElement('p');
  p.className = 'message';
  const b = p.appendChild(doc.createElement('b'));
  b.textContent = title;
  p.appendChild(doc.createElement('br'));
  p.append('Posted originally on the ');
  const home = p.appendChild(doc.createElement('a'));
  home.href = AO3;
  home.textContent = 'Archive of Our Own';
  p.append(' at ');
  const work = p.appendChild(doc.createElement('a'));
  work.href = url;
  work.textContent = url;
  p.append('.');
  return p;
}

/** The work in a saved AO3 page or AO3 download. Throws if there's no work in it. */
export function readAo3Work(doc: Document): Ao3Work {
  if (!isAo3Document(doc)) throw new Error('This file isn’t an AO3 work.');
  const draft = parseAo3Document(doc);
  const title = draft.title ?? 'Untitled';
  const url = draft.fic?.url ?? (draft.fic?.workId ? `${AO3}works/${draft.fic.workId}` : undefined);
  const chapters: Ao3Chapter[] = [];
  const chapter = (name: string) => {
    const c = { title: name, nodes: [] as Node[] };
    chapters.push(c);
    return c;
  };
  let preface: Node[];
  let afterword: Node[];

  const download = doc.getElementById('preface');
  if (download) {
    // AO3's "Download → HTML": #preface, #chapters, #afterword.
    preface = [download];
    let current: Ao3Chapter | undefined;
    for (const el of elements(doc.getElementById('chapters'))) {
      const heading = el.matches('.meta') ? el.querySelector('h2.heading') : null;
      if (heading) current = chapter(text(heading));
      (current ??= chapter(title)).nodes.push(el);
    }
    afterword = doc.getElementById('afterword') ? [doc.getElementById('afterword')!] : [];
  } else {
    // The work's page: tags above #workskin; inside, the preface, #chapters and end notes.
    const skin = doc.getElementById('workskin') ?? doc.body;
    const tags = doc.querySelector('dl.work.meta');
    preface = [...(url ? [postedAt(doc, title, url)] : []), ...(tags ? [tags] : []), ...elements(skin).filter((el) => el.matches('.preface:not(.afterword)'))];
    const list = doc.getElementById('chapters');
    for (const el of elements(list)) {
      if (el.matches('.chapter')) {
        const c = chapter(text(el.querySelector('.chapter.preface h3.title, h3.title')) || `Chapter ${chapters.length + 1}`);
        c.nodes.push(...elements(el));
      } else (chapters.at(-1) ?? chapter(title)).nodes.push(el);
    }
    afterword = elements(skin).filter((el) => el.matches('.afterword, #work_endnotes, #children'));
  }
  if (!chapters.some((c) => c.nodes.some((n) => text(n)))) throw new Error('This AO3 file has no chapters in it.');

  return {
    draft,
    title,
    authors: draft.authors?.length ? draft.authors : ['Anonymous'],
    language: draft.language ?? 'en',
    url,
    preface: preface.map(cleaned),
    chapters: chapters.map((c) => ({ title: c.title, nodes: c.nodes.map(cleaned) })),
    afterword: afterword.map(cleaned).filter((n) => text(n)),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One page of the book, as XHTML. */
function page(title: string, lang: string, nodes: Node[], cls: string): string {
  const doc = document.implementation.createDocument(XHTML, 'html', null);
  const html = doc.documentElement;
  html.setAttribute('lang', lang);
  html.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', lang);
  const head = html.appendChild(doc.createElementNS(XHTML, 'head'));
  head.appendChild(doc.createElementNS(XHTML, 'title')).textContent = title;
  const css = head.appendChild(doc.createElementNS(XHTML, 'link'));
  css.setAttribute('rel', 'stylesheet');
  css.setAttribute('type', 'text/css');
  css.setAttribute('href', 'style.css');
  const body = html.appendChild(doc.createElementNS(XHTML, 'body'));
  body.setAttribute('class', cls);
  for (const n of nodes) body.appendChild(doc.importNode(n, true));
  return '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n' + new XMLSerializer().serializeToString(doc);
}

const STYLE = `body { font-family: serif; line-height: 1.5; }
p { margin: 0 0 0.9em; }
h1, h2 { text-align: center; }
.message, .byline { text-align: center; }
dl.tags, dl.work.meta { border: 1px solid; padding: 0.8em 1em; }
dl.tags dt, dl.work.meta dt { font-weight: bold; }
dl.tags dd, dl.work.meta dd { margin: 0 0 0.6em 1.5em; }
dl.work.meta ul, dl.work.meta dl { display: inline; margin: 0; padding: 0; }
dl.work.meta li { display: inline; list-style: none; }
dl.work.meta li + li::before { content: ", "; }
blockquote.userstuff { margin: 0.5em 1.5em; }
.chapter h2.heading, .chapter h3.title { margin: 1.5em 0 1em; }
`;

/** A stable id for the book, from its AO3 address (or title). */
function bookId(work: Ao3Work): string {
  const key = work.url ?? `${work.title}|${work.authors.join(',')}`;
  const h = [hash(key), hash('a' + key), hash('b' + key), hash('c' + key)].map((n) => n.toString(16).padStart(8, '0')).join('');
  return `urn:uuid:${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The EPUB for a work read with readAo3Work. */
export function ao3Epub(work: Ao3Work, now = new Date()): Uint8Array {
  const lang = work.language;
  const pages: { file: string; title: string; xhtml: string }[] = [
    { file: 'preface.xhtml', title: 'Preface', xhtml: page(work.title, lang, work.preface, 'preface') },
    ...work.chapters.map((c, i) => ({ file: `chapter-${i + 1}.xhtml`, title: c.title, xhtml: page(c.title, lang, c.nodes, 'chapter') })),
    ...(work.afterword.length ? [{ file: 'afterword.xhtml', title: 'Afterword', xhtml: page('Afterword', lang, work.afterword, 'afterword') }] : []),
  ];
  const f = work.draft.fic;
  const subjects = [...(f?.fandoms ?? []), ...(f?.relationships ?? []), ...(f?.characters ?? []), ...(f?.additionalTags ?? [])];
  const id = bookId(work);
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${id}</dc:identifier>
    <dc:title>${esc(work.title)}</dc:title>
${work.authors.map((a) => `    <dc:creator>${esc(a)}</dc:creator>`).join('\n')}
    <dc:language>${esc(lang)}</dc:language>
    <dc:publisher>Archive of Our Own</dc:publisher>
${work.url ? `    <dc:source>${esc(work.url)}</dc:source>\n` : ''}${work.draft.description ? `    <dc:description>${esc(work.draft.description)}</dc:description>\n` : ''}${subjects.map((s) => `    <dc:subject>${esc(s)}</dc:subject>`).join('\n')}
${f?.publishedDate ? `    <dc:date>${esc(f.publishedDate)}</dc:date>\n` : ''}    <meta property="dcterms:modified">${now.toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${pages.map((p, i) => `    <item id="p${i}" href="${p.file}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${pages.map((_, i) => `    <itemref idref="p${i}"/>`).join('\n')}
  </spine>
</package>
`;
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}">
<head><title>${esc(work.title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${pages.map((p) => `      <li><a href="${p.file}">${esc(p.title)}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>
`;
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${esc(lang)}">
  <head><meta name="dtb:uid" content="${id}"/></head>
  <docTitle><text>${esc(work.title)}</text></docTitle>
  <navMap>
${pages.map((p, i) => `    <navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${esc(p.title)}</text></navLabel><content src="${p.file}"/></navPoint>`).join('\n')}
  </navMap>
</ncx>
`;
  const files: Record<string, Uint8Array> = {
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n',
    ),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
    'OEBPS/toc.ncx': strToU8(ncx),
    'OEBPS/style.css': strToU8(STYLE),
  };
  for (const p of pages) files[`OEBPS/${p.file}`] = strToU8(p.xhtml);
  return zipEpub(files);
}

/** A name for the EPUB: the HTML file's own name when it has one (AO3 names them after the title). */
function epubName(work: Ao3Work, htmlName?: string): string {
  const base = htmlName?.replace(/\.x?html?$/i, '').trim();
  if (base && base !== htmlName) return `${base}.epub`;
  return `${work.title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'AO3_work'}.epub`;
}

/** An AO3 work saved as HTML, as an EPUB file (undefined for any other file). */
export async function ao3EpubFromFile(file: File): Promise<File | undefined> {
  if (!/\.x?html?$/i.test(file.name) && !/html/.test(file.type)) return undefined;
  const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
  if (!isAo3Document(doc)) return undefined;
  const work = readAo3Work(doc);
  return new File([ao3Epub(work) as BlobPart], epubName(work, file.name), { type: 'application/epub+zip' });
}

/** The file itself, or, for an AO3 work saved as HTML, an EPUB made from it. */
export async function asEpubIfAo3(file: File): Promise<File> {
  try {
    return (await ao3EpubFromFile(file)) ?? file;
  } catch {
    return file;
  }
}
