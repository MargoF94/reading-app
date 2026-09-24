import { describe, expect, it } from 'vitest';
import { ao3WorkId, formatDate, normalize, parseNumber } from '../src/lib/util';

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
