// Keeps the local library and library.json in the private data repo in step.
// Strategy: download, merge per record (newest updatedAt wins), upload if
// anything changed. A write conflict (another device saved first) retries.
import { syncCovers } from './covers';
import { getMeta, setMeta } from './db';
import { GitHubError, getFile, putFile, type SyncConfig } from './github';
import { emptyCollections, mergeCollections, parseLibraryFile, sameContent, stableStringify, toLibraryFile } from './merge';
import { library } from './store.svelte';
import { debounce, nowIso } from './util';

export type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

const CONFIG_KEY = 'sync-config';
const LAST_KEY = 'sync-last';

class Sync {
  config = $state<SyncConfig | null>(null);
  state = $state<SyncState>('off');
  error = $state<string | null>(null);
  lastSyncedAt = $state<string | null>(null);
  pending = $state(false);

  #changeCounter = 0;
  #running: Promise<void> | null = null;
  #again = false;
  #holds = 0;

  async init(): Promise<void> {
    this.config = (await getMeta<SyncConfig>(CONFIG_KEY)) ?? null;
    this.lastSyncedAt = (await getMeta<string>(LAST_KEY)) ?? null;
    this.state = this.config ? 'idle' : 'off';

    library.onChange(() => {
      this.#changeCounter++;
      this.pending = true;
      if (!this.#holds) this.#schedule();
    });
    window.addEventListener('online', () => this.run());
    window.addEventListener('offline', () => {
      if (this.config) this.state = 'offline';
    });
    document.addEventListener('visibilitychange', () => {
      // Coming back: fetch changes from other devices. Leaving: save now rather than
      // after the usual delay, in case the tab is about to be closed (whoever holds
      // syncing back flushes it themselves once their own last changes are saved).
      if (document.visibilityState === 'visible') void this.run();
      else if (this.pending && !this.#holds) void this.run();
    });
    if (this.config) void this.run();
  }

  #schedule = debounce(() => {
    if (!this.#holds) void this.run();
  }, 3000);

  /**
   * Holds back the automatic upload after each change (the reader uses this, so page
   * turns aren't uploaded every few seconds). Changes are still saved on this device;
   * they go up when the hold is released, or when the holder calls flush().
   */
  hold(): () => void {
    this.#holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#holds--;
      if (!this.#holds) void this.flush();
    };
  }

  /** Uploads changes that haven't been synced yet, if there are any. */
  flush(): Promise<void> {
    if (this.#running) return this.#running; // it notices later changes and runs again
    return this.pending ? this.run() : Promise.resolve();
  }

  async configure(cfg: SyncConfig | null): Promise<void> {
    this.config = cfg;
    await setMeta(CONFIG_KEY, cfg ? $state.snapshot(cfg) : null);
    this.error = null;
    this.state = cfg ? 'idle' : 'off';
    if (cfg) await this.run();
  }

  /** Runs a sync now (queues one more if a sync is already running). */
  run(): Promise<void> {
    if (!this.config) return Promise.resolve();
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#sync().finally(() => {
      this.#running = null;
      if (this.#again) {
        this.#again = false;
        void this.run();
      }
    });
    return this.#running;
  }

  async #sync(): Promise<void> {
    const cfg = this.config;
    if (!cfg) return;
    if (!navigator.onLine) {
      this.state = 'offline';
      return;
    }
    const startCounter = this.#changeCounter;
    this.state = 'syncing';
    try {
      for (let attempt = 0; ; attempt++) {
        const remote = await getFile(cfg);
        const remoteData = remote ? parseLibraryFile(remote.text) : emptyCollections();
        await library.applyRemote(remoteData);
        const merged = mergeCollections(library.data, remoteData);
        if (remote && sameContent(merged, remoteData)) break;
        try {
          const text = stableStringify(toLibraryFile(merged, nowIso()));
          await putFile(cfg, text, remote?.sha, remote ? 'Update library' : 'Create library');
          break;
        } catch (e) {
          if (e instanceof GitHubError && e.status === 409 && attempt < 3) continue;
          throw e;
        }
      }
      await syncCovers(cfg);
      this.lastSyncedAt = nowIso();
      await setMeta(LAST_KEY, this.lastSyncedAt);
      this.error = null;
      this.state = 'idle';
      if (this.#changeCounter === startCounter) this.pending = false;
      else this.#again = true;
    } catch (e) {
      this.state = navigator.onLine ? 'error' : 'offline';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}

export const sync = new Sync();
