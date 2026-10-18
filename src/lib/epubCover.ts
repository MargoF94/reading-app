// Puts a cover picture into an EPUB, as "change EPUB cover" websites do: the book's own
// cover image is replaced, or a new one is added and marked as the cover both the
// EPUB 2 way (which Kindle's Send to Kindle reads) and the EPUB 3 way. Nothing else
// changes (no page is added), so places, bookmarks and quotes in the book stay valid.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export interface CoverImage {
  bytes: Uint8Array;
  type: 'image/jpeg' | 'image/png';
}

const OPF_NS = 'http://www.idpf.org/2007/opf';

/** The EPUB with `cover` as its cover. Throws if the file isn't an EPUB it can read. */
export function setEpubCover(epub: Uint8Array, cover: CoverImage): Uint8Array {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(epub);
  } catch {
    throw new Error('This EPUB file couldn’t be opened.');
  }
  const container = files['META-INF/container.xml'];
  const opfPath = container && /full-path\s*=\s*"([^"]+)"/.exec(strFromU8(container))?.[1];
  if (!opfPath || !files[opfPath]) throw new Error('This EPUB has no package file (content.opf).');

  const doc = new DOMParser().parseFromString(strFromU8(files[opfPath]), 'application/xml');
  const pkg = doc.documentElement;
  const metadata = first(pkg, 'metadata');
  const manifest = first(pkg, 'manifest');
  if (doc.querySelector('parsererror') || !metadata || !manifest) throw new Error('This EPUB’s package file couldn’t be read.');

  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = all(manifest, 'item');
  const metaCover = all(metadata, 'meta').find((m) => m.getAttribute('name') === 'cover');
  const isImage = (el: Element | undefined) => /^image\//.test(el?.getAttribute('media-type') ?? '');
  let item = items.find((i) => (i.getAttribute('properties') ?? '').split(/\s+/).includes('cover-image'));
  if (!isImage(item)) item = items.find((i) => i.getAttribute('id') === metaCover?.getAttribute('content'));

  if (item && isImage(item)) {
    // Replace the picture where it is, so any cover page showing it shows the new one.
    const path = resolve(dir, item.getAttribute('href') ?? '');
    files[path] = cover.bytes;
    item.setAttribute('media-type', cover.type);
  } else {
    const ext = cover.type === 'image/png' ? 'png' : 'jpg';
    let name = `cover.${ext}`;
    for (let n = 1; files[dir + name]; n++) name = `cover-${n}.${ext}`;
    let id = 'cover-image';
    for (let n = 1; items.some((i) => i.getAttribute('id') === id); n++) id = `cover-image-${n}`;
    files[dir + name] = cover.bytes;
    item = make(manifest, 'item');
    item.setAttribute('id', id);
    item.setAttribute('href', name);
    item.setAttribute('media-type', cover.type);
    if (/^3/.test(pkg.getAttribute('version') ?? '')) item.setAttribute('properties', 'cover-image');
    manifest.appendChild(item);
  }
  // The EPUB 2 marker, which Kindle (and many readers) look for.
  const id = item.getAttribute('id')!;
  if (metaCover) metaCover.setAttribute('content', id);
  else {
    const meta = make(metadata, 'meta');
    meta.setAttribute('name', 'cover');
    meta.setAttribute('content', id);
    metadata.appendChild(meta);
  }

  let xml = new XMLSerializer().serializeToString(doc);
  if (!xml.startsWith('<?xml')) xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
  files[opfPath] = strToU8(xml);
  return zipEpub(files);
}

/** Zips an EPUB: "mimetype" first and uncompressed, as readers expect; pictures stored as they are. */
export function zipEpub(files: Record<string, Uint8Array>): Uint8Array {
  const out: Zippable = { mimetype: [strToU8('application/epub+zip'), { level: 0 }] };
  for (const [name, data] of Object.entries(files)) {
    if (name === 'mimetype') continue;
    out[name] = [data, { level: /\.(jpe?g|png|gif|webp|woff2?|mp3|mp4)$/i.test(name) ? 0 : 6 }];
  }
  return zipSync(out);
}

function first(parent: Element, tag: string): Element | undefined {
  return all(parent, tag)[0];
}

function all(parent: Element, tag: string): Element[] {
  return [...parent.getElementsByTagNameNS('*', tag)];
}

/** A new element in the same namespace (and with the same prefix) as its parent-to-be. */
function make(parent: Element, tag: string): Element {
  const ns = parent.namespaceURI ?? OPF_NS;
  return parent.ownerDocument.createElementNS(ns, parent.prefix ? `${parent.prefix}:${tag}` : tag);
}

/** A manifest href (relative to the package file, maybe %-encoded) as a path in the zip. */
function resolve(dir: string, href: string): string {
  const parts = (dir + decodeURIComponent(href.split('#')[0])).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
