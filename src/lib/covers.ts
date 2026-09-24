// Cover photos uploaded by hand. Stored locally (IndexedDB) and as files in the
// data repo (covers/…), referenced from items as "repo:covers/…".
import { db, getMeta, setMeta } from './db';
import { deletePath, getBlob, putBlob, type SyncConfig } from './github';

export const REPO_PREFIX = 'repo:';
const DELETE_KEY = 'cover-deletes';

export function isRepoCover(url: string | undefined): url is string {
  return !!url?.startsWith(REPO_PREFIX);
}

/** Scales a photo down to at most 400×600 and re-encodes it (WebP, or JPEG where WebP isn't supported). */
export async function resizeImage(file: Blob, maxW = 400, maxH = 600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.82));
  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Couldn’t process this image.');
  return jpeg;
}

/** Saves a new cover for an item; returns the value for item.coverUrl. */
export async function saveCover(itemId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `covers/${itemId}-${Date.now().toString(36)}.${ext}`;
  await db.coverFiles.put({ path, blob, pending: true });
  return REPO_PREFIX + path;
}

/** Forgets a cover that is no longer used (removed from the repo on the next sync). */
export async function discardCover(coverUrl: string | undefined): Promise<void> {
  if (!isRepoCover(coverUrl)) return;
  const path = coverUrl.slice(REPO_PREFIX.length);
  const local = await db.coverFiles.get(path);
  await db.coverFiles.delete(path);
  if (local?.pending) return; // never uploaded
  const queue = (await getMeta<string[]>(DELETE_KEY)) ?? [];
  await setMeta(DELETE_KEY, [...new Set([...queue, path])]);
}

const srcCache = new Map<string, Promise<string | null>>();

/** A displayable URL for any cover value (object URL for uploaded covers). */
export function coverSrc(coverUrl: string): Promise<string | null> {
  if (!isRepoCover(coverUrl)) return Promise.resolve(coverUrl);
  const path = coverUrl.slice(REPO_PREFIX.length);
  let p = srcCache.get(path);
  if (!p) {
    p = loadBlob(path)
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
      .then((url) => {
        if (!url) srcCache.delete(path); // try again later (e.g. when back online)
        return url;
      });
    srcCache.set(path, p);
  }
  return p;
}

async function loadBlob(path: string): Promise<Blob | null> {
  const local = await db.coverFiles.get(path);
  if (local) return local.blob;
  const cfg = await getMeta<SyncConfig>('sync-config');
  if (!cfg || !navigator.onLine) return null;
  const blob = await getBlob(cfg, path);
  if (blob) await db.coverFiles.put({ path, blob, pending: false });
  return blob;
}

/** Uploads new covers and removes discarded ones. Called by sync after the library is saved. */
export async function syncCovers(cfg: SyncConfig): Promise<void> {
  const pending = await db.coverFiles.filter((c) => c.pending).toArray();
  for (const c of pending) {
    await putBlob(cfg, c.path, c.blob, 'Add cover');
    await db.coverFiles.update(c.path, { pending: false });
  }
  const queue = (await getMeta<string[]>(DELETE_KEY)) ?? [];
  for (const path of queue) {
    await deletePath(cfg, path, 'Remove cover');
    const rest = ((await getMeta<string[]>(DELETE_KEY)) ?? []).filter((p) => p !== path);
    await setMeta(DELETE_KEY, rest);
  }
}
