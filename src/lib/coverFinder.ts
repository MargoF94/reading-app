// Finds covers for books that have none: Open Library by ISBN (in batches), then
// Open Library search by title + author for books without an ISBN.
import { openLibraryByIsbns } from './lookup';
import type { Item } from './types';
import { normalize } from './util';

export interface CoverProgress {
  done: number;
  total: number;
  found: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sameTitle(a: string, b: string): boolean {
  const x = normalize(a).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const y = normalize(b).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
}

/**
 * Calls `save` with updated items as covers are found (in small batches).
 * `authorOf` gives the first author's name for title searches.
 */
export async function findCovers(
  items: Item[],
  authorOf: (item: Item) => string,
  save: (updated: Item[]) => Promise<void>,
  onProgress: (p: CoverProgress) => void,
  signal: AbortSignal,
  searchByTitle = true,
): Promise<CoverProgress> {
  const todo = items.filter((i) => i.type === 'book' && !i.coverUrl);
  const progress: CoverProgress = { done: 0, total: todo.length, found: 0 };
  onProgress({ ...progress });
  let batch: Item[] = [];
  const flush = async () => {
    if (batch.length) await save(batch);
    batch = [];
  };

  // 1. ISBN lookups, 40 per request.
  const withIsbn = todo.filter((i) => i.book?.isbn13);
  const missing: Item[] = todo.filter((i) => !i.book?.isbn13);
  for (let i = 0; i < withIsbn.length && !signal.aborted; i += 40) {
    const chunk = withIsbn.slice(i, i + 40);
    try {
      const found = await openLibraryByIsbns(chunk.map((b) => b.book!.isbn13!), signal);
      for (const item of chunk) {
        const d = found.get(item.book!.isbn13!);
        if (d?.coverUrl) {
          batch.push({
            ...item,
            coverUrl: d.coverUrl,
            book: { ...item.book!, pageCount: item.book!.pageCount ?? d.book?.pageCount },
          });
          progress.found++;
        } else missing.push(item);
      }
    } catch {
      if (signal.aborted) break;
      missing.push(...chunk);
    }
    progress.done += chunk.length;
    onProgress({ ...progress });
    await flush();
  }

  // 2. Title + author search, one request per second to be polite.
  if (searchByTitle) {
    progress.total = progress.done + missing.length;
    for (const item of missing) {
      if (signal.aborted) break;
      try {
        const q = `title=${encodeURIComponent(item.title)}&author=${encodeURIComponent(authorOf(item))}`;
        const res = await fetch(`https://openlibrary.org/search.json?${q}&limit=3&fields=title,cover_i`, { signal });
        const data = res.ok ? await res.json() : null;
        const hit = (data?.docs ?? []).find((d: { title: string; cover_i?: number }) => d.cover_i && sameTitle(d.title, item.title));
        if (hit) {
          batch.push({ ...item, coverUrl: `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` });
          progress.found++;
        }
      } catch {
        if (signal.aborted) break;
      }
      progress.done++;
      onProgress({ ...progress });
      if (batch.length >= 10) await flush();
      await sleep(1000);
    }
  }
  await flush();
  return progress;
}
