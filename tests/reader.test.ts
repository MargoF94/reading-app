import { describe, expect, it } from 'vitest';
import { cleanPrefs, DEFAULT_PREFS, percentOf, readableFile, readerCss, readerProgress } from '../src/lib/reader';
import type { Item, Reading, StoredFile } from '../src/lib/types';

const reading = (fields: Partial<Reading> = {}): Reading => ({
  id: 'r1',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  itemId: 'b',
  outcome: 'reading',
  unit: 'pages',
  log: [],
  startDate: '2026-10-01',
  ...fields,
});

describe('reader settings', () => {
  it('fills in and clamps saved settings', () => {
    expect(cleanPrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(cleanPrefs({ fontSize: 10 }).fontSize).toBe(50);
    const p = cleanPrefs({ fontSize: 999, lineHeight: 1.234, margin: -4, theme: 'neon', layout: 'scroll' });
    expect(p).toMatchObject({ fontSize: 220, lineHeight: 1.2, margin: 0, theme: 'white', layout: 'scroll' });
  });

  it('puts line spacing, size and theme into the book', () => {
    const css = readerCss({ ...DEFAULT_PREFS, lineHeight: 2.1, fontSize: 130, theme: 'dark' }, 'en');
    expect(css).toContain('line-height: 2.1 !important');
    expect(css).toContain('font-size: 130% !important');
    expect(css).toContain('#c9cdd1');
    expect(css).toContain('hyphens: auto');
    expect(css).not.toContain('writing-mode');
  });

  it('leaves fonts alone for the book’s own and handles Japanese direction', () => {
    expect(readerCss({ ...DEFAULT_PREFS, font: 'book' }, 'en')).not.toContain('font-family');
    const ja = readerCss({ ...DEFAULT_PREFS, writing: 'vertical' }, 'ja');
    expect(ja).toContain('writing-mode: vertical-rl !important');
    expect(ja).toContain('Hiragino Mincho');
    expect(ja).not.toContain('hyphens');
    // Direction only applies to Japanese books.
    expect(readerCss({ ...DEFAULT_PREFS, writing: 'vertical' }, 'en')).not.toContain('writing-mode');
  });
});

describe('reader fonts and corners', () => {
  it('uses Literata with its @font-face rules after @namespace', () => {
    const css = readerCss({ ...DEFAULT_PREFS }, 'en', "@font-face { font-family: 'Literata'; src: url('https://x/f.woff2'); }");
    const lines = css.split('\n');
    expect(lines[0]).toMatch(/^@namespace/);
    expect(lines[1]).toContain('@font-face');
    expect(css).toContain("font-family: 'Literata', 'Iowan Old Style'");
    expect(readerCss({ ...DEFAULT_PREFS, font: 'custom' }, 'ja')).toContain("'ReaderCustomFont', 'Hiragino Mincho ProN'");
  });

  it('defaults to a Kindle-like look and keeps a known footer choice', () => {
    expect(DEFAULT_PREFS).toMatchObject({ theme: 'white', font: 'literata', footer: 'location' });
    expect(cleanPrefs({ footer: 'book-time', theme: 'light' })).toMatchObject({ footer: 'book-time', theme: 'light' });
    expect(cleanPrefs({ footer: 'nope' }).footer).toBe('location');
  });
});

describe('reader progress', () => {
  it('rounds down, and only shows 100% at the very end', () => {
    expect(percentOf(0.429)).toBe(42);
    expect(percentOf(0.994)).toBe(99);
    expect(percentOf(0.996)).toBe(100);
  });

  it('adds one entry per day and updates it as pages turn', () => {
    const r1 = readerProgress([reading()], 12, '2026-10-07', 'now')!;
    expect(r1.log).toHaveLength(1);
    expect(r1.log[0]).toMatchObject({ date: '2026-10-07', value: 12, unit: 'percent' });
    const r2 = readerProgress([r1], 18, '2026-10-07', 'later')!;
    expect(r2.log).toHaveLength(1);
    expect(r2.log[0]).toMatchObject({ value: 18, id: r1.log[0].id });
    const r3 = readerProgress([r2], 25, '2026-10-08', 'next day')!;
    expect(r3.log.map((e) => e.value)).toEqual([18, 25]);
  });

  it('adds nothing when reopening at the same place or at the very start', () => {
    const r = reading({ log: [{ id: 'e', date: '2026-10-06', value: 40, unit: 'percent' }] });
    expect(readerProgress([r], 40, '2026-10-07', 'now')).toBeNull();
    expect(readerProgress([reading()], 0, '2026-10-07', 'now')).toBeNull();
  });

  it('keeps a manual entry made later the same day', () => {
    const r = reading({
      log: [
        { id: 'a', date: '2026-10-07', value: 30, unit: 'percent' },
        { id: 'b', date: '2026-10-07', value: 120, unit: 'pages' },
      ],
    });
    expect(readerProgress([r], 45, '2026-10-07', 'now')!.log.map((e) => e.value)).toEqual([30, 120, 45]);
  });

  it('doesn’t restart finished books, and resumes ones on hold', () => {
    expect(readerProgress([reading({ outcome: 'finished', finishDate: '2026-09-01' })], 50, '2026-10-07', 'now')).toBeNull();
    expect(readerProgress([reading({ outcome: 'on-hold' })], 50, '2026-10-07', 'now')!.outcome).toBe('reading');
  });
});

describe('which file to read', () => {
  const f = (id: string, name: string, at?: string): StoredFile => ({
    id,
    name,
    path: `files/b/${id}`,
    size: 1,
    addedAt: 'x',
    position: at ? { cfi: 'epubcfi(/6/2)', fraction: 0.3, at } : undefined,
  });
  const item = (files: StoredFile[]) => ({ id: 'b', files }) as unknown as Item;

  it('picks the EPUB read most recently, ignoring other files', () => {
    expect(readableFile(item([f('p', 'x.pdf')]))).toBeUndefined();
    expect(readableFile(item([f('a', 'a.epub'), f('b', 'b.epub')]))?.id).toBe('a');
    expect(readableFile(item([f('a', 'a.epub', '2026-10-01'), f('b', 'b.EPUB', '2026-10-05')]))?.id).toBe('b');
  });
});

describe('selected text', async () => {
  const { sentenceAt, selectedWord, quoteLocation } = await import('../src/lib/reader');
  it('finds the sentence around a word', () => {
    const t = 'It was late. The keeper counted shelves by candle light! Then he slept.';
    const i = t.indexOf('candle');
    expect(sentenceAt(t, i, i + 6)).toBe('The keeper counted shelves by candle light!');
    expect(sentenceAt('Mr. Smith left', 4, 9)).toBe('Smith left');
    const ja = '吾輩は猫である。名前はまだ無い。どこで生れたか。';
    const j = ja.indexOf('名前');
    expect(sentenceAt(ja, j, j + 2)).toBe('名前はまだ無い。');
  });

  it('cuts long sentences around the word', () => {
    const long = 'word '.repeat(200) + 'target ' + 'word '.repeat(200) + '.';
    const i = long.indexOf('target');
    const s = sentenceAt(long, i, i + 6, 60);
    expect(s).toContain('target');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(62);
  });

  it('turns a selection into a word, or nothing for longer passages', () => {
    expect(selectedWord(' “ephemeral,” ')).toBe('ephemeral');
    expect(selectedWord('look up')).toBe('look up');
    expect(selectedWord('this is far too many words')).toBeUndefined();
    expect(selectedWord('猫')).toBe('猫');
  });

  it('describes where a quote is', () => {
    expect(quoteLocation('Chapter 4', 0.531)).toBe('Chapter 4 · 53%');
    expect(quoteLocation(undefined, 0.2)).toBe('20%');
  });
});
