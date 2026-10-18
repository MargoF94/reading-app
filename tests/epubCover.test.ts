// @vitest-environment jsdom
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { setEpubCover } from '../src/lib/epubCover';

const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

function opf(version: string, metadata = '', manifest = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Kostio</dc:title>${metadata}</metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>${manifest}</manifest><spine><itemref idref="c1"/></spine></package>`;
}

function epub(packageXml: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(packageXml),
    'OEBPS/c1.xhtml': strToU8('<html><body><p>Hello</p></body></html>'),
    ...extra,
  });
}

const JPEG: { bytes: Uint8Array; type: 'image/jpeg' } = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), type: 'image/jpeg' };

function read(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const doc = new DOMParser().parseFromString(strFromU8(files['OEBPS/content.opf']), 'application/xml');
  const items = [...doc.getElementsByTagNameNS('*', 'item')];
  const meta = [...doc.getElementsByTagNameNS('*', 'meta')].find((m) => m.getAttribute('name') === 'cover');
  const cover = items.find((i) => i.getAttribute('id') === meta?.getAttribute('content'));
  return { files, items, meta, cover, spine: doc.getElementsByTagNameNS('*', 'itemref').length };
}

describe('EPUB covers', () => {
  it('adds a cover to an EPUB 2 book, marked the way Kindle reads it', () => {
    const r = read(setEpubCover(epub(opf('2.0')), JPEG));
    expect(r.cover?.getAttribute('href')).toBe('cover.jpg');
    expect(r.cover?.getAttribute('media-type')).toBe('image/jpeg');
    expect(r.cover?.hasAttribute('properties')).toBe(false); // EPUB 3 only
    expect([...r.files['OEBPS/cover.jpg']]).toEqual([...JPEG.bytes]);
    // Nothing else changes: no page is added, so places in the book stay valid.
    expect(r.spine).toBe(1);
    expect(strFromU8(r.files['OEBPS/c1.xhtml'])).toContain('Hello');
  });

  it('also marks it the EPUB 3 way in EPUB 3 books', () => {
    const r = read(setEpubCover(epub(opf('3.0')), JPEG));
    expect(r.cover?.getAttribute('properties')).toBe('cover-image');
    expect(r.cover?.namespaceURI).toBe('http://www.idpf.org/2007/opf');
  });

  it('replaces a cover the book already has, where it is', () => {
    const png = { 'OEBPS/images/front.png': new Uint8Array([0x89, 0x50]) };
    const withCover = opf('3.0', '', '<item id="front" href="images/front.png" media-type="image/png" properties="cover-image"/>');
    const r = read(setEpubCover(epub(withCover, png), JPEG));
    expect(r.items.filter((i) => /^image\//.test(i.getAttribute('media-type') ?? ''))).toHaveLength(1);
    expect(r.cover?.getAttribute('id')).toBe('front');
    expect(r.cover?.getAttribute('media-type')).toBe('image/jpeg');
    expect([...r.files['OEBPS/images/front.png']]).toEqual([...JPEG.bytes]);

    const epub2 = opf('2.0', '<meta name="cover" content="img"/>', '<item id="img" href="../cover.jpeg" media-type="image/jpeg"/>');
    const r2 = read(setEpubCover(epub(epub2, { 'cover.jpeg': new Uint8Array([1]) }), JPEG));
    expect([...r2.files['cover.jpeg']]).toEqual([...JPEG.bytes]);
    expect(r2.cover?.getAttribute('id')).toBe('img');
  });

  it('doesn’t overwrite a picture that merely has the name', () => {
    const r = read(setEpubCover(epub(opf('2.0'), { 'OEBPS/cover.jpg': new Uint8Array([7]) }), JPEG));
    expect(r.cover?.getAttribute('href')).toBe('cover-1.jpg');
    expect([...r.files['OEBPS/cover.jpg']]).toEqual([7]);
  });

  it('keeps "mimetype" first and uncompressed', () => {
    const out = setEpubCover(epub(opf('3.0')), JPEG);
    const view = new DataView(out.buffer, out.byteOffset);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(view.getUint16(8, true)).toBe(0); // stored
    const nameLength = view.getUint16(26, true);
    expect(strFromU8(out.subarray(30, 30 + nameLength))).toBe('mimetype');
  });

  it('refuses files that aren’t EPUBs', () => {
    expect(() => setEpubCover(strToU8('not a zip'), JPEG)).toThrow();
    expect(() => setEpubCover(zipSync({ 'a.txt': strToU8('x') }), JPEG)).toThrow(/package file/);
  });
});
