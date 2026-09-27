// EPUBs (and other files) for a book or fic, kept in the private data repo
// under files/<item id>/… so they can be downloaded again on any synced device.
import { deletePath, getBlob, putBlob, type SyncConfig } from './github';
import type { Item, StoredFile } from './types';
import { newId, nowIso } from './util';

/** GitHub takes files up to 100 MB, sent base64-encoded (a third bigger); stay well under. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** A repo-safe file name that keeps letters in any script ("カラーレシピ 上.epub" → "カラーレシピ-上.epub"). */
export function safeFileName(name: string): string {
  name = name.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFC');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const clean = base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'file';
  return ext ? `${clean}.${ext}` : clean;
}

export function filePath(itemId: string, name: string, stamp = Date.now()): string {
  return `files/${itemId}/${stamp.toString(36)}-${safeFileName(name)}`;
}

const typeOf = (name: string, type: string) =>
  type || (/\.epub$/i.test(name) ? 'application/epub+zip' : /\.pdf$/i.test(name) ? 'application/pdf' : 'application/octet-stream');

/** Uploads a file to the data repo and returns its record (add it to item.files). */
export async function uploadItemFile(cfg: SyncConfig, item: Item, file: File): Promise<StoredFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`“${file.name}” is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const path = filePath(item.id, file.name);
  await putBlob(cfg, path, file, `Add file for ${item.title}`, 'the file');
  return { id: newId(), name: file.name, path, size: file.size, type: typeOf(file.name, file.type), addedAt: nowIso() };
}

export async function downloadItemFile(cfg: SyncConfig, f: StoredFile): Promise<File> {
  const blob = await getBlob(cfg, f.path, 'the file');
  if (!blob) throw new Error(`“${f.name}” isn’t in the data repository any more.`);
  return new File([blob], f.name, { type: f.type ?? blob.type });
}

export async function deleteItemFile(cfg: SyncConfig, item: Item, f: StoredFile): Promise<void> {
  await deletePath(cfg, f.path, `Remove file for ${item.title}`, 'the file');
}

/** Saves a downloaded file to the device. */
export function saveToDevice(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens the system share sheet (on iPhone: "Books" to read it). False if the device can't share files. */
export async function openWith(file: File): Promise<boolean> {
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  }
  return true;
}

export const canShareFiles = (): boolean => {
  try {
    return !!navigator.canShare?.({ files: [new File([''], 'x.epub', { type: 'application/epub+zip' })] });
  } catch {
    return false;
  }
};
