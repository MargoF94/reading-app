<script lang="ts">
  import {
    canShareFiles,
    deleteItemFile,
    downloadItemFile,
    formatBytes,
    MAX_FILE_BYTES,
    openWith,
    replaceItemFile,
    uploadItemFile,
  } from '../lib/itemFiles';
  import { draftFromEpub } from '../lib/import/epub';
  import { ficUpdateFromDraft, type FieldChange } from '../lib/ficUpdate';
  import type { Item as ItemT } from '../lib/types';
  import { deviceFiles } from '../lib/deviceFiles.svelte';
  import { isEpub } from '../lib/reader';
  import { library } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Item, StoredFile } from '../lib/types';
  import { formatDate } from '../lib/util';
  import Icon from './Icon.svelte';

  // EPUBs (or other files) for this book or fic, kept in the private data repo.
  let { item }: { item: Item } = $props();

  const files = $derived(item.files ?? []);
  const shareable = canShareFiles();
  let input: HTMLInputElement | undefined = $state();
  let uploading = $state<string[]>([]);
  let busy = $state<Record<string, 'get' | 'delete'>>({});
  // Downloaded files, ready to save or open (a second tap: phones only allow that right after a tap).
  let ready = $state<Record<string, { file: File; url: string }>>({});

  const current = () => library.item(item.id) ?? item;

  $effect(() => void deviceFiles.load());

  async function upload(e: Event) {
    const list = [...((e.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    const cfg = sync.config;
    if (!cfg || !list.length) return;
    for (const file of list) {
      uploading = [...uploading, file.name];
      try {
        const rec = await uploadItemFile(cfg, current(), file);
        // Keep EPUBs on this device too, so they open in the reader right away.
        if (isEpub(rec)) await deviceFiles.keep(rec, file).catch(() => {});
        const fresh = current();
        await library.saveItem({ ...fresh, files: [...(fresh.files ?? []), rec] });
        toasts.show(`Saved “${file.name}” to your repository.`);
      } catch (err) {
        toasts.show(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        uploading = uploading.filter((n) => n !== file.name);
      }
    }
  }

  async function get(f: StoredFile) {
    const cfg = sync.config;
    if (!cfg && !deviceFiles.has(f)) return;
    busy = { ...busy, [f.id]: 'get' };
    try {
      const file = isEpub(f) ? await deviceFiles.fetch(cfg, f) : await downloadItemFile(cfg!, f);
      ready = { ...ready, [f.id]: { file, url: URL.createObjectURL(file) } };
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      const { [f.id]: _, ...rest } = busy;
      busy = rest;
    }
  }

  async function open(f: StoredFile) {
    const r = ready[f.id];
    if (!r) return;
    try {
      if (!(await openWith(r.file))) toasts.show('This device can’t open files from here. Use Save instead.');
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async function remove(f: StoredFile) {
    const cfg = sync.config;
    if (!cfg || !confirm(`Delete “${f.name}” from your repository?`)) return;
    busy = { ...busy, [f.id]: 'delete' };
    try {
      await deleteItemFile(cfg, current(), f);
      await deviceFiles.forget(f).catch(() => {});
      const fresh = current();
      await library.saveItem({ ...fresh, files: (fresh.files ?? []).filter((x) => x.id !== f.id) });
      toasts.show('File deleted.');
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      const { [f.id]: _, ...rest } = busy;
      busy = rest;
    }
  }

  // ---- a newer version of an EPUB (e.g. an AO3 fic with new chapters) ----

  let newerInput: HTMLInputElement | undefined = $state();
  let newerFor: StoredFile | null = null;
  let replacing = $state<{ f: StoredFile; file: File; changes: FieldChange[]; patch: Partial<ItemT> } | null>(null);
  let replaceBusy = $state(false);

  function pickNewer(f: StoredFile) {
    newerFor = f;
    newerInput?.click();
  }

  async function newerPicked(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (newerInput) newerInput.value = '';
    const f = newerFor;
    if (!file || !f) return;
    let changes: FieldChange[] = [];
    let patch: Partial<ItemT> = {};
    if (item.type === 'fic') {
      try {
        ({ changes, patch } = ficUpdateFromDraft(current(), draftFromEpub(new Uint8Array(await file.arrayBuffer()))));
      } catch {
        // Not an AO3 file: replace the file, keep the fic's details as they are.
      }
    }
    replacing = { f, file, changes, patch };
  }

  async function confirmReplace(keepBoth: boolean) {
    const r = replacing;
    const cfg = sync.config;
    if (!r || !cfg) return;
    replaceBusy = true;
    try {
      const fresh = current();
      let files = fresh.files ?? [];
      if (keepBoth) {
        const rec = await uploadItemFile(cfg, fresh, r.file);
        await deviceFiles.keep(rec, r.file).catch(() => {});
        files = [...files, rec];
      } else {
        const rec = await replaceItemFile(cfg, fresh, r.f, r.file);
        await deviceFiles.forget(r.f).catch(() => {});
        await deviceFiles.keep(rec, r.file).catch(() => {});
        files = files.map((x) => (x.id === r.f.id ? rec : x));
      }
      const latest = current();
      await library.saveItem({ ...latest, ...r.patch, files });
      toasts.show(keepBoth ? 'Both versions kept.' : 'Updated to the newer version. Your place is kept.');
      replacing = null;
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      replaceBusy = false;
    }
  }

  async function forgetLocal(f: StoredFile) {
    if (!confirm(`Remove “${f.name}” from this device? It stays in your repository and can be downloaded again.`)) return;
    await deviceFiles.forget(f);
    const { [f.id]: _, ...rest } = ready;
    if (_) URL.revokeObjectURL(_.url);
    ready = rest;
    toasts.show('Removed from this device.');
  }

  $effect(() => () => {
    for (const r of Object.values(ready)) URL.revokeObjectURL(r.url);
  });
</script>

<section>
  <div class="row head">
    <h2>Files</h2>
    {#if sync.config}
      <button type="button" class="btn ghost small" disabled={!navigator.onLine} onclick={() => input?.click()}>
        <Icon name="upload" size={16} /> Add EPUB
      </button>
    {/if}
  </div>
  <input bind:this={input} type="file" accept=".epub,application/epub+zip,.pdf,.cbz,.zip,.mobi,.azw3,.txt" multiple hidden onchange={upload} />
  <input bind:this={newerInput} type="file" accept=".epub,application/epub+zip" hidden onchange={newerPicked} />

  {#if files.length}
    <ul class="files">
      {#each files as f (f.id)}
        {@const r = ready[f.id]}
        <li>
          <Icon name="book" size={20} />
          <div class="info">
            <span class="name">{f.name}</span>
            <span class="small muted">
              {formatBytes(f.size)} · added {formatDate(f.addedAt.slice(0, 10))}
              {#if deviceFiles.has(f)}· <span class="here">on this device</span>{/if}
            </span>
            {#if r}
              <div class="row actions">
                <a class="btn small primary" href={r.url} download={f.name}><Icon name="download" size={15} /> Save</a>
                {#if shareable}<button type="button" class="btn small" onclick={() => open(f)}>Open in…</button>{/if}
              </div>
            {/if}
            <div class="row links">
              {#if isEpub(f) && sync.config}
                <button type="button" class="linkish small" disabled={!navigator.onLine} onclick={() => pickNewer(f)}>Upload newer version</button>
              {/if}
              {#if deviceFiles.has(f)}
                <button type="button" class="linkish small" onclick={() => forgetLocal(f)}>Remove from this device</button>
              {/if}
            </div>
            {#if replacing?.f.id === f.id}
              <div class="replace card" role="group" aria-label="Replace with the newer EPUB">
                <strong>Replace with “{replacing.file.name}”?</strong>
                {#if replacing.changes.length}
                  <table class="small">
                    <tbody>
                      {#each replacing.changes as c (c.label)}
                        <tr><th scope="row">{c.label}</th><td>{c.from} → <strong>{c.to}</strong></td></tr>
                      {/each}
                    </tbody>
                  </table>
                {:else if item.type === 'fic'}
                  <p class="small muted">No changes in chapters or words found in the new file.</p>
                {/if}
                <p class="small muted">
                  Your place, bookmarks and quotes stay with it.{item.type === 'fic' && replacing.changes.length ? ' The fic’s details update too.' : ''}
                </p>
                <div class="row">
                  <button type="button" class="btn small primary" disabled={replaceBusy} onclick={() => confirmReplace(false)}>
                    {replaceBusy ? 'Uploading…' : 'Replace'}
                  </button>
                  <button type="button" class="btn small" disabled={replaceBusy} onclick={() => confirmReplace(true)}>Keep both</button>
                  <button type="button" class="btn small ghost" disabled={replaceBusy} onclick={() => (replacing = null)}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
          <div class="btns">
            {#if isEpub(f) && (sync.config || deviceFiles.has(f))}
              <a class="btn small primary" href="#/read/{item.id}/{f.id}" aria-label="Read “{f.name}”">
                {f.position && f.position.fraction > 0 ? 'Continue' : 'Read'}
              </a>
            {/if}
            {#if !r}
              <button
                type="button"
                class="btn small"
                disabled={!!busy[f.id] || (!deviceFiles.has(f) && (!sync.config || !navigator.onLine))}
                onclick={() => get(f)}
                aria-label="Save or share “{f.name}”"
              >
                {busy[f.id] === 'get' ? 'Getting…' : isEpub(f) ? 'Save…' : 'Download'}
              </button>
            {/if}
            <button
              type="button"
              class="btn ghost icon small"
              disabled={!sync.config || !!busy[f.id]}
              aria-label="Delete “{f.name}”"
              onclick={() => remove(f)}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#each uploading as name (name)}
    <p class="small muted uploading" role="status">Uploading “{name}”… (large files take a while)</p>
  {/each}

  {#if !sync.config}
    <p class="small muted">
      {files.length ? 'Connect' : 'To keep EPUBs of this ' + (item.type === 'fic' ? 'fic' : 'book') + ' in your private repository, connect'}
      sync in <a href="#/settings">Settings</a>{files.length ? ' to download these files on this device.' : '.'}
    </p>
  {:else if !files.length && !uploading.length}
    <p class="small muted">
      Keep EPUBs here to download again any time. They’re stored in your private data repository (up to {formatBytes(MAX_FILE_BYTES)}
      each).
    </p>
  {/if}
</section>

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  h2 {
    margin: 0;
  }

  .files {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .files li {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
    color: var(--text-2);
  }

  .files li:last-child {
    border-bottom: none;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    color: var(--text);
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .actions {
    gap: 0.4rem;
    margin-top: 0.35rem;
    flex-wrap: wrap;
  }

  .btns {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .here {
    color: var(--ok);
    font-weight: 600;
  }

  .links {
    gap: 0.9rem;
    flex-wrap: wrap;
  }

  .replace {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .replace p {
    margin: 0;
  }

  .replace th {
    text-align: left;
    font-weight: normal;
    color: var(--text-2);
    padding: 0.1rem 1rem 0.1rem 0;
  }

  .replace .row {
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .linkish {
    align-self: flex-start;
    border: none;
    background: none;
    padding: 0.2rem 0;
    font: inherit;
    color: var(--text-2);
    text-decoration: underline;
    cursor: pointer;
  }

  .btns .btn.primary {
    text-decoration: none;
  }

  .uploading {
    margin: 0.4rem 0 0;
  }
</style>
