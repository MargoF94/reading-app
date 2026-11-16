// @vitest-environment jsdom
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ao3Epub, ao3EpubFromFile, originalUrl, readAo3Work } from '../src/lib/import/ao3Epub';
import { draftFromEpub } from '../src/lib/import/epub';

// A made-up work, in AO3's "Download → HTML" layout.
const DOWNLOAD = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"><head><meta charset="utf-8" /><title>Lantern Hours - quietmoth - Original Work</title></head>
<body>
<div id="preface">
  <h2 class="toc-heading">Preface</h2>
  <p class="message"><b>Lantern Hours</b><br />Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/123456">https://archiveofourown.org/works/123456</a>.</p>
  <div class="meta">
    <dl class="tags">
      <dt>Rating:</dt><dd><a href="https://archiveofourown.org/tags/Teen%20And%20Up%20Audiences">Teen And Up Audiences</a></dd>
      <dt>Archive Warning:</dt><dd><a href="#">No Archive Warnings Apply</a></dd>
      <dt>Category:</dt><dd><a href="#">Gen</a></dd>
      <dt>Fandom:</dt><dd><a href="#">Original Work</a></dd>
      <dt>Relationship:</dt><dd><a href="#">Mara &amp; The Keeper</a></dd>
      <dt>Characters:</dt><dd><a href="#">Mara (Original Character)</a>, <a href="#">The Keeper</a></dd>
      <dt>Additional Tags:</dt><dd><a href="#">Found Family</a>, <a href="#">Slow Burn</a></dd>
      <dt>Language:</dt><dd>English</dd>
      <dt>Stats:</dt><dd>Published: 2024-02-01 Completed: 2024-03-01 Words: 2,000 Chapters: 2/2</dd>
    </dl>
    <h1>Lantern Hours</h1>
    <div class="byline">by <a rel="author" href="https://archiveofourown.org/users/quietmoth/pseuds/quietmoth">quietmoth</a></div>
    <p>Summary</p>
    <blockquote class="userstuff"><p>A keeper, a light, and a <i>long</i> winter.</p></blockquote>
  </div>
</div>
<div id="chapters" class="userstuff">
  <div class="meta group"><h2 class="heading">Chapter 1: The Pier</h2><p>Chapter Notes</p><blockquote class="userstuff"><p>Hello there.</p></blockquote></div>
  <!--chapter content-->
  <div class="userstuff"><p>The boards were soft with salt.</p><p>She <em>waited</em>.<br />And waited.</p><img src="https://example.com/art.png" alt="fanart" /><script>alert(1)</script></div>
  <!--/chapter content-->
  <div class="meta group"><p>Chapter End Notes</p><blockquote class="userstuff"><p>Thanks for reading.</p></blockquote></div>
  <div class="meta group"><h2 class="heading">Chapter 2: The Light</h2></div>
  <div class="userstuff"><p>Morning came in pale &amp; slow.</p><p><a href="https://web.archive.org/web/20210801225335/https://archiveofourown.org/works/1">one</a> <a href="/works/2" onclick="x()">two</a></p></div>
</div>
<div id="afterword"><h2 class="toc-heading">Afterword</h2><div class="meta"><p>End Notes</p><blockquote class="userstuff"><p>The end.</p></blockquote></div><p class="message">Please drop by the archive and comment.</p></div>
</body></html>`;

// The same work's page, saved from the Wayback Machine.
const PAGE = `<html><head><title>Lantern Hours - quietmoth - Original Work [Archive of Our Own]</title>
<link rel="canonical" href="https://archiveofourown.org/works/123456" /></head>
<body>
<div id="wm-ipp-base">Wayback Machine toolbar</div>
<div id="main">
<dl class="work meta group">
  <dt class="rating tags">Rating:</dt><dd class="rating tags"><ul class="commas"><li><a class="tag" href="/web/2021/https://archiveofourown.org/tags/x">Teen And Up Audiences</a></li></ul></dd>
  <dt class="fandom tags">Fandom:</dt><dd class="fandom tags"><ul class="commas"><li><a class="tag" href="#">Original Work</a></li></ul></dd>
  <dt class="relationship tags">Relationship:</dt><dd class="relationship tags"><ul class="commas"><li><a class="tag" href="#">Mara &amp; The Keeper</a></li></ul></dd>
  <dt class="language">Language:</dt><dd class="language">English</dd>
  <dt class="stats">Stats:</dt><dd class="stats"><dl class="stats"><dt class="published">Published:</dt><dd class="published">2024-02-01</dd><dt class="words">Words:</dt><dd class="words">2,000</dd><dt class="chapters">Chapters:</dt><dd class="chapters">2/2</dd></dl></dd>
</dl>
<div id="workskin">
  <div class="preface group"><h2 class="title heading">Lantern Hours</h2>
    <h3 class="byline heading"><a rel="author" href="/users/quietmoth/pseuds/quietmoth">quietmoth</a></h3>
    <div class="summary module"><h3 class="heading">Summary:</h3><blockquote class="userstuff"><p>A keeper, a light.</p></blockquote></div></div>
  <div id="chapters" role="article">
    <div class="chapter" id="chapter-1">
      <div class="chapter preface group" role="complementary"><h3 class="title"><a href="/works/123456/chapters/1">Chapter 1</a>: The Pier</h3></div>
      <div class="userstuff module" role="article"><h3 class="landmark heading" id="work">Chapter Text</h3><p>The boards were soft with salt.</p></div>
      <div class="chapter preface group" role="complementary"><div class="end notes module"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>Thanks.</p></blockquote></div></div>
    </div>
    <div class="chapter" id="chapter-2">
      <div class="chapter preface group"><h3 class="title"><a href="/works/123456/chapters/2">Chapter 2</a>: The Light</h3></div>
      <div class="userstuff module" role="article"><h3 class="landmark heading">Chapter Text</h3><p>Morning came in pale.</p></div>
    </div>
  </div>
  <div class="afterword preface group"><div id="work_endnotes" class="end notes module"><h3 class="heading">Notes:</h3><blockquote class="userstuff"><p>The end.</p></blockquote></div></div>
</div>
<div id="feedback"><ul class="actions"><li><button>Kudos ♥</button></li></ul></div>
</div>
</body></html>`;

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xhtml+xml');
const NOW = new Date('2026-11-16T00:00:00Z');

describe('AO3 works saved as HTML, made into EPUBs', () => {
  it('reads AO3 downloads', () => {
    const w = readAo3Work(parse(DOWNLOAD));
    expect(w).toMatchObject({ title: 'Lantern Hours', authors: ['quietmoth'], language: 'en', url: 'https://archiveofourown.org/works/123456' });
    expect(w.chapters.map((c) => c.title)).toEqual(['Chapter 1: The Pier', 'Chapter 2: The Light']);
    expect(w.chapters[0].nodes.map((n) => n.textContent).join(' ')).toContain('Thanks for reading.'); // end notes stay with their chapter
    expect(w.afterword.map((n) => n.textContent).join(' ')).toContain('The end.');
  });

  it('reads work pages saved from a browser, Wayback copies too', () => {
    const w = readAo3Work(parse(PAGE));
    expect(w).toMatchObject({ title: 'Lantern Hours', authors: ['quietmoth'], url: 'https://archiveofourown.org/works/123456' });
    expect(w.chapters.map((c) => c.title)).toEqual(['Chapter 1: The Pier', 'Chapter 2: The Light']);
    const all = [...w.preface, ...w.chapters.flatMap((c) => c.nodes), ...w.afterword].map((n) => n.textContent).join(' ');
    expect(all).not.toContain('Chapter Text'); // screen-reader labels go
    expect(all).not.toContain('Wayback Machine toolbar');
    expect(all).not.toContain('Kudos');
  });

  it('makes an EPUB that readers, Kindles and this app can open', () => {
    const epub = ao3Epub(readAo3Work(parse(DOWNLOAD)), NOW);
    expect(strFromU8(epub.slice(30, 38))).toBe('mimetype'); // first, and stored as it is
    const files = unzipSync(epub);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/style.css', 'OEBPS/preface.xhtml', 'OEBPS/chapter-1.xhtml', 'OEBPS/chapter-2.xhtml', 'OEBPS/afterword.xhtml']),
    );
    for (const [name, data] of Object.entries(files)) {
      if (/\.(xhtml|opf|ncx|xml)$/.test(name)) expect(xml(strFromU8(data)).querySelector('parsererror'), name).toBeNull();
    }
    const ch1 = strFromU8(files['OEBPS/chapter-1.xhtml']);
    expect(ch1).toContain('The boards were soft with salt.');
    expect(ch1).toContain('<br />');
    expect(ch1).not.toContain('<script');
    expect(ch1).toContain('<a href="https://example.com/art.png">[Image: fanart]</a>');
    const ch2 = strFromU8(files['OEBPS/chapter-2.xhtml']);
    expect(ch2).toContain('pale &amp; slow');
    expect(ch2).toContain('href="https://archiveofourown.org/works/1"'); // out of the Wayback Machine
    expect(ch2).toContain('href="https://archiveofourown.org/works/2"');
    expect(ch2).not.toContain('onclick');
    const opf = strFromU8(files['OEBPS/content.opf']);
    expect(opf).toContain('<dc:title>Lantern Hours</dc:title>');
    expect(opf).toContain('<dc:creator>quietmoth</dc:creator>');
    expect(opf).toContain('<dc:source>https://archiveofourown.org/works/123456</dc:source>');
    expect(opf).toContain('<dc:subject>Found Family</dc:subject>');
    expect(strFromU8(files['OEBPS/nav.xhtml'])).toContain('<a href="chapter-2.xhtml">Chapter 2: The Light</a>');
    // The same work always gets the same EPUB.
    expect(ao3Epub(readAo3Work(parse(DOWNLOAD)), NOW)).toEqual(epub);
  });

  it('keeps the fic’s details, so the app can read them back', () => {
    for (const html of [DOWNLOAD, PAGE]) {
      const d = draftFromEpub(ao3Epub(readAo3Work(parse(html)), NOW));
      expect(d).toMatchObject({ type: 'fic', title: 'Lantern Hours', authors: ['quietmoth'] });
      expect(d.fic).toMatchObject({ workId: '123456', rating: 'teen', fandoms: ['Original Work'], relationships: ['Mara & The Keeper'] });
    }
  });

  it('turns only AO3 works into EPUBs', async () => {
    const epub = await ao3EpubFromFile(new File([DOWNLOAD], 'Lantern_Hours.html', { type: 'text/html' }));
    expect(epub?.name).toBe('Lantern_Hours.epub');
    expect(epub?.type).toBe('application/epub+zip');
    expect(await ao3EpubFromFile(new File(['<p>Just a page</p>'], 'page.html', { type: 'text/html' }))).toBeUndefined();
    expect(await ao3EpubFromFile(new File(['plain'], 'notes.txt', { type: 'text/plain' }))).toBeUndefined();
  });

  it('takes links out of the Wayback Machine', () => {
    expect(originalUrl('https://web.archive.org/web/20210801225335/https://archiveofourown.org/works/1')).toBe('https://archiveofourown.org/works/1');
    expect(originalUrl('/web/20210801225335im_/https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(originalUrl('/works/2')).toBe('https://archiveofourown.org/works/2');
    expect(originalUrl('#chapter-2')).toBe('#chapter-2');
  });
});
