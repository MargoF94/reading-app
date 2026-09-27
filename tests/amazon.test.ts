// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { amazonDate, amazonImage, collectAmazon, parseAmazonPayload, parseAmazonRef, splitAmazonTitle, type AmazonPayload } from '../src/lib/import/amazon';
import { amazonBookmarklet, decodePayload, draftFromHtmlFile, draftFromPayload } from '../src/lib/import/payload';

// Synthetic pages following Amazon's desktop (Kindle) and mobile (print) layouts.
const page = (f: string) => new DOMParser().parseFromString(readFileSync(`tests/fixtures/${f}`, 'utf8'), 'text/html');
const KINDLE_URL = 'https://www.amazon.co.jp/%E3%82%AB%E3%83%A9%E3%83%BC%E3%83%AC%E3%82%B7%E3%83%94-%E4%B8%8A-%E3%83%87%E3%82%A3%E3%82%A2%E3%83%97%E3%83%A9%E3%82%B9%E3%83%BB%E3%82%B3%E3%83%9F%E3%83%83%E3%82%AF%E3%82%B9-%E3%81%AF%E3%82%89%E3%81%A0-ebook/dp/B07CRQRQL2/ref=mp_s_a_1_1_sspa?crid=X&keywords=%E3%82%AB%E3%83%A9%E3%83%BC&psc=1';

describe('Amazon pages', () => {
  it('reads a Kindle manga page', () => {
    const p = collectAmazon(page('amazon-kindle.html'), KINDLE_URL) as unknown as AmazonPayload;
    expect(p.asin).toBe('B07CRQRQL2');
    expect(p.u).not.toContain('?');
    const d = parseAmazonPayload(p);
    expect(d).toMatchObject({
      source: 'Amazon',
      title: 'カラーレシピ 上',
      authors: ['はらだ'],
      series: 'カラーレシピ',
      seriesNumber: '1',
      language: 'ja',
      coverUrl: 'https://m.media-amazon.com/images/I/51abcDEF12L.jpg',
      book: { publisher: '新書館', publicationDate: '2018-05-01', pageCount: 196, format: 'manga' },
    });
    expect(d.book?.isbn13).toBeUndefined(); // a Kindle ASIN isn't an ISBN
    expect(d.description).toContain('**冬司**');
  });

  it('reads a mobile print page (ISBN, pages, bunko, no translator as author)', () => {
    const d = draftFromHtmlFile(readFileSync('tests/fixtures/amazon-mobile-paper.html', 'utf8'));
    expect(d).toMatchObject({
      title: 'コンビニ人間',
      authors: ['村田 沙耶香'],
      coverUrl: 'https://m.media-amazon.com/images/I/81xyz.jpg',
      book: { publisher: '文藝春秋', publicationDate: '2018-09-04', pageCount: 168, isbn13: '9784167911300', format: 'paperback' },
    });
  });

  it('refuses pages without a book', () => {
    const doc = new DOMParser().parseFromString('<html><body><p>search</p></body></html>', 'text/html');
    expect(typeof collectAmazon(doc, 'https://www.amazon.co.jp/s?k=x')).toBe('string');
    expect(typeof collectAmazon(doc, 'https://example.com/')).toBe('string');
  });

  it('works as a bookmarklet', () => {
    const href = amazonBookmarklet('https://margof94.github.io/reading-app/');
    const code = decodeURIComponent(href.replace(/^javascript:/, ''));
    let opened = '';
    const doc = page('amazon-kindle.html');
    new Function('document', 'location', 'window', 'alert', code)(doc, { href: KINDLE_URL }, { open: (u: string) => ((opened = u), {}) }, () => {});
    const d = draftFromPayload(decodePayload(opened.split('?d=')[1]));
    expect(d.title).toBe('カラーレシピ 上');
    expect(d.book?.format).toBe('manga');
  });

  it('splits titles, dates and images', () => {
    expect(splitAmazonTitle('進撃の巨人（34） (講談社コミックス)')).toMatchObject({ title: '進撃の巨人（34）', series: '進撃の巨人', number: '34' });
    expect(splitAmazonTitle('ダンジョン飯 14巻 (HARTA COMIX)')).toMatchObject({ title: 'ダンジョン飯 14巻', series: 'ダンジョン飯', number: '14' });
    expect(splitAmazonTitle('カラーレシピ 下', 'カラーレシピ (全2巻)')).toMatchObject({ series: 'カラーレシピ', number: '2' });
    expect(splitAmazonTitle('ノルウェイの森')).toEqual({ title: 'ノルウェイの森', series: undefined });
    expect(amazonDate('2018年5月1日')).toBe('2018-05-01');
    expect(amazonDate('May 1, 2018')).toBe('2018-05-01');
    expect(amazonImage('https://m.media-amazon.com/images/I/81xyz._AC_SX184_.jpg')).toBe('https://m.media-amazon.com/images/I/81xyz.jpg');
    expect(amazonImage('data:image/gif;base64,xx')).toBeUndefined();
  });

  it('turns pasted links and ASINs into an ISBN or a title search', () => {
    expect(parseAmazonRef(KINDLE_URL)).toEqual({ asin: 'B07CRQRQL2', query: 'カラーレシピ 上 はらだ' });
    expect(parseAmazonRef('https://www.amazon.co.jp/dp/4167911302')).toMatchObject({ asin: '4167911302', isbn13: '9784167911300' });
    expect(parseAmazonRef('https://www.amazon.co.jp/gp/aw/d/4167911302/ref=x')).toMatchObject({ isbn13: '9784167911300' });
    expect(parseAmazonRef('b07crqrql2')).toEqual({ asin: 'B07CRQRQL2' });
    expect(parseAmazonRef('https://amzn.asia/d/abc123')).toEqual({ asin: undefined, query: undefined });
    expect(parseAmazonRef('4167911302')).toBeUndefined(); // plain ISBN-10
    expect(parseAmazonRef('The Name of the Wind')).toBeUndefined();
    expect(parseAmazonRef('https://www.goodreads.com/book/show/1')).toBeUndefined();
  });
});
