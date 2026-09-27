import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteItemFile, downloadItemFile, filePath, formatBytes, MAX_FILE_BYTES, safeFileName, uploadItemFile } from '../src/lib/itemFiles';
import type { Item } from '../src/lib/types';

const cfg = { owner: 'me', repo: 'reading-data', token: 't' };
const item = { id: 'i1', title: 'カラーレシピ 上' } as Item;

afterEach(() => vi.unstubAllGlobals());

describe('stored files', () => {
  it('makes safe, unique repo paths that keep Japanese names', () => {
    expect(safeFileName('カラーレシピ 上 (Kindle).EPUB')).toBe('カラーレシピ-上-Kindle.epub');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('???.epub')).toBe('file.epub');
    expect(filePath('i1', 'A Fic.epub', 36 ** 3)).toBe('files/i1/1000-A-Fic.epub');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(3.2 * 1024 * 1024)).toBe('3.2 MB');
  });

  it('uploads, downloads and deletes through the GitHub contents API', async () => {
    const calls: { url: string; method: string; accept: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, method: init.method ?? 'GET', accept: headers.Accept, body: init.body as string | undefined });
      if (init.method === 'PUT') return new Response('{}', { status: 201 });
      if (init.method === 'DELETE') return new Response('{}', { status: 200 });
      if (headers.Accept.includes('object')) return new Response(JSON.stringify({ sha: 'abc' }));
      return new Response(new Blob(['EPUBDATA']));
    }));
    const file = new File(['hello'], 'カラーレシピ 上.epub', { type: '' });
    const rec = await uploadItemFile(cfg, item, file);
    expect(rec).toMatchObject({ name: 'カラーレシピ 上.epub', size: 5, type: 'application/epub+zip' });
    expect(rec.path).toMatch(/^files\/i1\/[a-z0-9]+-カラーレシピ-上\.epub$/);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toContain('/repos/me/reading-data/contents/files/i1/');
    expect(calls[0].url).toContain(encodeURIComponent('カラーレシピ'));
    expect(JSON.parse(calls[0].body!).content).toBe(btoa('hello'));

    const got = await downloadItemFile(cfg, rec);
    expect(got.name).toBe('カラーレシピ 上.epub');
    expect(await got.text()).toBe('EPUBDATA');
    expect(calls[1].accept).toBe('application/vnd.github.raw+json');

    await deleteItemFile(cfg, item, rec);
    expect(calls.slice(2).map((c) => c.method)).toEqual(['GET', 'DELETE']);
    expect(JSON.parse(calls[3].body!).sha).toBe('abc');
  });

  it('refuses files that are too big', async () => {
    const big = { name: 'big.epub', size: MAX_FILE_BYTES + 1 } as File;
    await expect(uploadItemFile(cfg, item, big)).rejects.toThrow(/up to 50 MB/);
  });
});
