import { describe, expect, it } from 'vitest';
import { ao3WorkId, formatDate, normalize, parseNumber, songUrl } from '../src/lib/util';

describe('normalize', () => {
  it('folds case, ё and katakana for search', () => {
    expect(normalize('ЁЖИК')).toBe('ежик');
    expect(normalize('カタカナ')).toBe(normalize('かたかな'));
    expect(normalize('ＡＢＣ')).toBe('abc');
  });
});

describe('helpers', () => {
  it('extracts AO3 work ids', () => {
    expect(ao3WorkId('https://archiveofourown.org/works/91869436/chapters/244673591')).toBe('91869436');
    expect(ao3WorkId('https://example.com')).toBeUndefined();
  });

  it('parses numbers with separators', () => {
    expect(parseNumber('25,473')).toBe(25473);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
  });

  it('formats partial dates', () => {
    expect(formatDate('2026')).toBe('2026');
    expect(formatDate('2026-09')).toBe('Sep 2026');
    expect(formatDate('2026-09-04')).toBe('Sep 4, 2026');
  });
});

describe('songUrl', () => {
  it('accepts web links and rejects anything else', () => {
    expect(songUrl('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(songUrl(' open.spotify.com/track/1 ')).toBe('https://open.spotify.com/track/1');
    expect(songUrl('javascript:alert(1)')).toBeUndefined();
    expect(songUrl('data:text/html,hi')).toBeUndefined();
    expect(songUrl('not a link')).toBeUndefined();
    expect(songUrl('')).toBeUndefined();
  });
});
