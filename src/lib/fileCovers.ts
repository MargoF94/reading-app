// A book's or fic's own cover inside its EPUBs: put in when the cover is set, and into
// EPUBs added later (a newer AO3 download, say). The EPUB in the data repo is replaced
// by the copy with the cover; it stays the same file to the app, so the place you're
// at, bookmarks and quotes in it all stay.
import { coverBlob } from './covers';
import { deviceFiles } from './deviceFiles.svelte';
import { setEpubCover, type CoverImage } from './epubCover';
import type { SyncConfig } from './github';
import { replaceItemFile } from './itemFiles';
import { isEpub } from './reader';
import { library } from './store.svelte';
import { sync } from './sync.svelte';
import { toasts } from './toast.svelte';
import type { Item, StoredFile } from './types';

/** The item's cover as a picture for its EPUBs, when it's a cover that goes into them. */
export async function epubCoverImage(item: Item): Promise<CoverImage | undefined> {
  if (!item.epubCover || !item.coverUrl) return undefined;
  let blob = await coverBlob(item.coverUrl);
  if (!blob) return undefined;
  if (blob.type !== 'image/jpeg' && blob.type !== 'image/png') blob = await asJpeg(blob); // e.g. WebP, which EPUBs can't hold
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type === 'image/png' ? 'image/png' : 'image/jpeg' };
}

/** Whether this EPUB of the item is missing the item's cover. */
export const needsCover = (item: Item, f: StoredFile): boolean =>
  !!item.epubCover && !!item.coverUrl && isEpub(f) && f.cover !== item.coverUrl;

/**
 * An EPUB being added to the item, with the item's cover put in; `cover` is set when it was.
 * Files that aren't EPUBs, or that can't be read as one, are left as they are.
 */
export async function withItemCover(item: Item, file: File): Promise<{ file: File; cover?: string }> {
  if (!isEpub(file)) return { file };
  const image = await epubCoverImage(item).catch(() => undefined);
  if (!image) return { file };
  try {
    const bytes = setEpubCover(new Uint8Array(await file.arrayBuffer()), image);
    return { file: new File([bytes as BlobPart], file.name, { type: 'application/epub+zip' }), cover: item.coverUrl };
  } catch {
    return { file };
  }
}

/**
 * Puts the item's cover into its EPUBs that don't have it yet (or just `only`), replacing
 * each in the data repo. Returns the item's files to save, and the names of any that failed.
 */
export async function coverItemEpubs(
  cfg: SyncConfig,
  item: Item,
  only?: string,
): Promise<{ files: StoredFile[]; failed: string[] }> {
  const files = item.files ?? [];
  const image = await epubCoverImage(item);
  if (!image) return { files, failed: [] };
  const failed: string[] = [];
  const out: StoredFile[] = [];
  for (const f of files) {
    if (!needsCover(item, f) || (only && f.id !== only)) {
      out.push(f);
      continue;
    }
    try {
      const file = await deviceFiles.fetch(cfg, f);
      const bytes = setEpubCover(new Uint8Array(await file.arrayBuffer()), image);
      const next = new File([bytes as BlobPart], f.name, { type: 'application/epub+zip' });
      const rec = await replaceItemFile(cfg, item, f, next);
      await deviceFiles.forget(f).catch(() => {});
      await deviceFiles.keep(rec, next).catch(() => {});
      out.push({ ...rec, addedAt: f.addedAt, cover: item.coverUrl });
    } catch {
      failed.push(f.name);
      out.push(f);
    }
  }
  return { files: out, failed };
}

const queue = new Map<string, Promise<void>>();

/**
 * Puts the item's cover into its EPUBs (or just `only`) in the background, one item's
 * changes after another, and saves the item when done. Shows how it went.
 */
export function putCoverInEpubs(itemId: string, only?: string): Promise<void> {
  const run = async () => {
    const cfg = sync.config;
    const item = library.item(itemId);
    if (!cfg || !item || !(item.files ?? []).some((f) => needsCover(item, f) && (!only || f.id === only))) return;
    const { files, failed } = await coverItemEpubs(cfg, item, only);
    const changed = new Map(files.filter((f, i) => f !== item.files![i]).map((f) => [f.id, f]));
    if (changed.size) {
      const latest = library.item(itemId) ?? item;
      await library.saveItem({ ...latest, files: (latest.files ?? []).map((f) => changed.get(f.id) ?? f) });
      toasts.show(changed.size > 1 ? 'Cover added to the EPUBs.' : 'Cover added to the EPUB.');
    }
    if (failed.length) toasts.show(`Couldn’t put the cover into “${failed.join('”, “')}”. Try again from Files.`, 'error');
  };
  const next = (queue.get(itemId) ?? Promise.resolve()).then(run, run);
  queue.set(itemId, next);
  return next;
}

async function asJpeg(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!out) throw new Error('Couldn’t process the cover.');
  return out;
}
