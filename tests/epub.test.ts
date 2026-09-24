// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { draftFromEpub, isZip } from '../src/lib/import/epub';

const preface = readFileSync('tests/fixtures/ao3-download.html', 'utf8');

function epub(files: Record<string, string>): Uint8Array {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  });
}

describe('AO3 EPUB', () => {
  it('reads the AO3 preface page', () => {
    const bytes = epub({
      'OEBPS/content.opf': '<package/>',
      'OEBPS/chapter1.xhtml': '<html><body><p>Story</p></body></html>',
      'OEBPS/preface.xhtml': preface,
    });
    expect(isZip(bytes)).toBe(true);
    const d = draftFromEpub(bytes);
    expect(d).toMatchObject({
      title: 'Salt and Stars',
      authors: ['one', 'two'],
      language: 'ja',
      series: 'Tidal',
      wordCount: 40002,
      fic: { rating: 'explicit', chaptersAvailable: 7, chaptersTotal: 7, complete: true, workId: '7654321' },
    });
  });

  it('falls back to the package metadata', () => {
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Only Metadata</dc:title><dc:creator>writer</dc:creator><dc:language>ru</dc:language>
      <dc:identifier>https://archiveofourown.org/works/555</dc:identifier><dc:subject>Fluff</dc:subject>
      <dc:description>&lt;p&gt;Short &lt;b&gt;summary&lt;/b&gt;&lt;/p&gt;</dc:description></metadata></package>`;
    const d = draftFromEpub(epub({ 'content.opf': opf, 'ch1.xhtml': '<html><body>x</body></html>' }));
    expect(d).toMatchObject({
      title: 'Only Metadata',
      authors: ['writer'],
      language: 'ru',
      description: 'Short **summary**',
      fic: { workId: '555', url: 'https://archiveofourown.org/works/555', additionalTags: ['Fluff'] },
    });
  });

  it('rejects files that are not EPUBs', () => {
    expect(() => draftFromEpub(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
