<script lang="ts">
  import {
    canShareFiles,
    deleteItemFile,
    downloadItemFile,
    formatBytes,
    MAX_FILE_BYTES,
    openWith,
    uploadItemFile,
  } from '../lib/itemFiles';
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

  async function upload(e: Event) {
    const list = [...((e.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    const cfg = sync.config;
    if (!cfg || !list.length) return;
    for (const file of list) {
      uploading = [...uploading, file.name];
      try {
        const rec = await uploadItemFile(cfg, current(), file);
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
    if (!cfg) return;
    busy = { ...busy, [f.id]: 'get' };
    try {
      const file = await downloadItemFile(cfg, f);
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

  {#if files.length}
    <ul class="files">
      {#each files as f (f.id)}
        {@const r = ready[f.id]}
        <li>
          <Icon name="book" size={20} />
          <div class="info">
            <span class="name">{f.name}</span>
            <span class="small muted">{formatBytes(f.size)} · added {formatDate(f.addedAt.slice(0, 10))}</span>
            {#if r}
              <div class="row actions">
                <a class="btn small primary" href={r.url} download={f.name}><Icon name="download" size={15} /> Save</a>
                {#if shareable}<button type="button" class="btn small" onclick={() => open(f)}>Open in…</button>{/if}
              </div>
            {/if}
          </div>
          <div class="btns">
            {#if !r}
              <button
                type="button"
                class="btn small"
                disabled={!sync.config || !!busy[f.id] || !navigator.onLine}
                onclick={() => get(f)}
                aria-label="Download “{f.name}”"
              >
                {busy[f.id] === 'get' ? 'Getting…' : 'Download'}
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

  .uploading {
    margin: 0.4rem 0 0;
  }
</style>
