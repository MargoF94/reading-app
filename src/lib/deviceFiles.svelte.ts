// EPUBs kept on this device so the reader opens them instantly and offline.
// The copy in the private data repo stays the original; this is only a cache.
import { db } from './db';
import { downloadItemFile } from './itemFiles';
import type { SyncConfig } from './github';
import type { StoredFile } from './types';
import { nowIso } from './util';

class DeviceFiles {
  /** Repo paths of the files on this device. */
  paths = $state.raw<Set<string>>(new Set());
  #loaded: Promise<void> | null = null;

  load(): Promise<void> {
    this.#loaded ??= db.deviceFiles
      .toCollection()
      .primaryKeys()
      .then((keys) => {
        this.paths = new Set(keys);
      })
      .catch(() => {});
    return this.#loaded;
  }

  has(f: StoredFile): boolean {
    return this.paths.has(f.path);
  }

  async get(f: StoredFile): Promise<File | undefined> {
    const row = await db.deviceFiles.get(f.path);
    return row ? new File([row.blob], f.name, { type: row.type }) : undefined;
  }

  async keep(f: StoredFile, file: Blob): Promise<void> {
    await db.deviceFiles.put({ path: f.path, blob: file, name: f.name, type: f.type ?? file.type, savedAt: nowIso() });
    this.paths = new Set([...this.paths, f.path]);
  }

  async forget(f: StoredFile): Promise<void> {
    await db.deviceFiles.delete(f.path);
    const next = new Set(this.paths);
    next.delete(f.path);
    this.paths = next;
  }

  /** The file from this device, or downloaded from the data repo (and kept). */
  async fetch(cfg: SyncConfig | null, f: StoredFile): Promise<File> {
    const local = await this.get(f);
    if (local) return local;
    if (!cfg) throw new Error('This book isn’t on this device yet. Connect sync in Settings to download it.');
    if (!navigator.onLine) throw new Error('This book isn’t on this device yet. Connect to the internet to download it once.');
    const file = await downloadItemFile(cfg, f);
    try {
      await this.keep(f, file);
    } catch {
      // Storage full or unavailable: read it this time without keeping a copy.
    }
    return file;
  }
}

export const deviceFiles = new DeviceFiles();
