// Saved words, found in a book's text so the reader can highlight them: whole words in
// languages written with spaces (in any case), anywhere in Japanese and Chinese. A word is
// found across inline markup (italics, links) and furigana, which isn't read as text.

/** Text is read a paragraph at a time; words don't run across paragraphs. */
const BLOCK = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, td, th, figcaption, pre, div, section, article, body';
/** Furigana and anything that isn't text on the page. */
const SKIP = 'rt, rp, script, style, noscript';
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const key = (word: string) => word.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** One regular expression finding any of the words (null when there are none). */
export function wordPattern(words: string[]): RegExp | null {
  const list = [...new Set(words.map((w) => w.normalize('NFC').trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const parts = list.map((w) => {
    const body = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    // Japanese and Chinese have no spaces between words: there, a word is found anywhere.
    return CJK.test(w) ? body : `(?<![\\p{L}\\p{M}\\p{N}])${body}(?![\\p{L}\\p{M}\\p{N}])`;
  });
  return new RegExp(parts.join('|'), 'giu');
}

export interface WordMatch {
  range: Range;
  /** The saved word it is (as saved, not as written on the page). */
  word: string;
}

/** Every place one of the words appears in the document (up to `limit` places). */
export function findWords(doc: Document, words: string[], limit = 2000): WordMatch[] {
  const pattern = wordPattern(words);
  const body = doc.body;
  if (!pattern || !body) return [];
  const saved = new Map(words.map((w) => [key(w), w]));
  const out: WordMatch[] = [];

  let block: Element | null = null;
  let nodes: Text[] = [];
  let starts: number[] = [];
  let text = '';

  /** The text node and offset at a place in the paragraph's text. */
  const at = (offset: number, end: boolean): [Text, number] => {
    let i = 0;
    while (i < nodes.length - 1 && (end ? starts[i + 1] < offset : starts[i + 1] <= offset)) i++;
    return [nodes[i], offset - starts[i]];
  };

  const search = () => {
    if (!text.trim()) return;
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m && out.length < limit; m = pattern.exec(text)) {
      const range = doc.createRange();
      range.setStart(...at(m.index, false));
      range.setEnd(...at(m.index + m[0].length, true));
      out.push({ range, word: saved.get(key(m[0])) ?? m[0] });
    }
  };

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode() as Text | null; n && out.length < limit; n = walker.nextNode() as Text | null) {
    const b = n.parentElement?.closest(BLOCK) ?? body;
    if (b !== block) {
      search();
      block = b;
      nodes = [];
      starts = [];
      text = '';
    }
    nodes.push(n);
    starts.push(text.length);
    text += n.data;
  }
  search();
  return out;
}
