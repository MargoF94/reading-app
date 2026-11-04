// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findWords, wordPattern } from '../src/lib/highlights';

const page = (html: string) => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
const found = (html: string, words: string[]) => findWords(page(html), words).map((m) => [m.range.toString(), m.word]);

describe('saved words in a book’s text', () => {
  it('finds whole words in any case, not parts of other words', () => {
    expect(found('<p>Reverie. A reverie, then REVERIES and irreverie.</p>', ['reverie'])).toEqual([
      ['Reverie', 'reverie'],
      ['reverie', 'reverie'],
    ]);
    expect(found('<p>Он читал книгу. Читал!</p>', ['читал'])).toEqual([
      ['читал', 'читал'],
      ['Читал', 'читал'],
    ]);
  });

  it('finds phrases, and words split by italics or links', () => {
    expect(found('<p>a <em>forlorn</em> hope; the for<i>lorn</i> one; forlorn\nhope</p>', ['forlorn hope', 'forlorn'])).toEqual([
      ['forlorn hope', 'forlorn hope'],
      ['forlorn', 'forlorn'],
      ['forlorn\nhope', 'forlorn hope'],
    ]);
  });

  it('finds Japanese words anywhere, reading past furigana', () => {
    const html = '<p>彼は<ruby>憂鬱<rt>ゆううつ</rt></ruby>だった。憂鬱な朝。</p><p>ゆううつ</p>';
    expect(found(html, ['憂鬱'])).toEqual([
      ['憂鬱', '憂鬱'],
      ['憂鬱', '憂鬱'],
    ]);
  });

  it('keeps to paragraphs, and finds nothing without words', () => {
    expect(found('<p>end of a sentence</p><p>hope</p>', ['sentence hope'])).toEqual([]);
    expect(found('<p>anything</p>', [])).toEqual([]);
    expect(wordPattern(['  ', ''])).toBeNull();
    // Characters with a meaning in patterns are just text.
    expect(found('<p>C++ and (maybe) a.b</p>', ['c++', '(maybe)', 'a.b'])).toHaveLength(3);
  });
});
