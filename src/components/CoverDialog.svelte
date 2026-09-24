<script lang="ts">
  import { untrack } from 'svelte';
  import { discardCover, isRepoCover, resizeImage, saveCover } from '../lib/covers';
  import { lookupIsbn, QuotaError, searchBooks } from '../lib/lookup';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Item } from '../lib/types';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  // Change a book's or fic's cover straight from its page. Saves immediately.
  let { item, open, onclose }: { item: Item; open: boolean; onclose: () => void } = $props();

  let link = $state('');
  let busy = $state(false);
  let message = $state('');
  let candidates = $state<string[]>([]);
  let searched = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open)
      untrack(() => {
        link = isRepoCover(item.coverUrl) ? '' : (item.coverUrl ?? '');
        message = '';
        candidates = [];
        searched = false;
      });
  });

  async function apply(coverUrl: string | undefined, blob?: Blob) {
    busy = true;
    try {
      const next = blob ? await saveCover(item.id, blob) : coverUrl;
      if (isRepoCover(item.coverUrl) && item.coverUrl !== next) await discardCover(item.coverUrl);
      await library.saveItem({ ...item, coverUrl: next });
      toasts.show(next ? 'Cover updated.' : 'Cover removed.');
      onclose();
    } finally {
      busy = false;
    }
  }

  async function upload(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      await apply(undefined, await resizeImage(file));
    } catch {
      message = 'Couldn’t read that image. Try a JPEG or PNG.';
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async function findOnline() {
    busy = true;
    message = '';
    try {
      const opts = { googleKey: library.settings.googleBooksKey };
      const urls = new Set<string>();
      const isbn = item.book?.isbn13;
      if (isbn) {
        const found = await lookupIsbn(isbn, opts).catch(() => undefined);
        if (found?.coverUrl) urls.add(found.coverUrl);
      }
      const query = [item.titleReading && !item.title ? item.titleReading : item.title, library.authorNames(item)]
        .filter(Boolean)
        .join(' ');
      const results = await searchBooks(query, opts).catch((err) => {
        if (err instanceof QuotaError) message = err.message;
        return [];
      });
      for (const r of results) if (r.coverUrl) urls.add(r.coverUrl);
      urls.delete(item.coverUrl ?? '');
      candidates = [...urls].slice(0, 12);
      searched = true;
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} title="Change cover" {onclose}>
  <div class="stack">
    <div class="current">
      <Cover {item} width={110} />
      <div class="stack actions">
        <button type="button" class="btn" disabled={busy} onclick={() => fileInput?.click()}>
          <Icon name="upload" size={18} /> Upload a photo
        </button>
        {#if item.type === 'book'}
          <button type="button" class="btn" disabled={busy} onclick={findOnline}>
            <Icon name="search" size={18} /> {busy && !searched ? 'Searching…' : 'Find covers online'}
          </button>
        {/if}
        {#if item.coverUrl}
          <button type="button" class="btn ghost danger" disabled={busy} onclick={() => apply(undefined)}>
            Remove cover
          </button>
        {/if}
      </div>
    </div>

    {#if searched}
      {#if candidates.length}
        <div>
          <span class="label">Pick a cover</span>
          <div class="candidates">
            {#each candidates as url (url)}
              <button type="button" class="candidate" disabled={busy} onclick={() => apply(url)} aria-label="Use this cover">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  onerror={(e) => ((e.currentTarget as HTMLImageElement).closest('button')!.hidden = true)}
                />
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <p class="small muted">No other covers found online. Upload a photo or paste an image link instead.</p>
      {/if}
    {/if}

    <form
      class="row link"
      onsubmit={(e) => {
        e.preventDefault();
        if (link.trim()) void apply(link.trim());
      }}
    >
      <label class="field grow">
        <span>Image link</span>
        <input type="url" bind:value={link} placeholder="https://…" />
      </label>
      <button class="btn" disabled={busy || !link.trim()}>Use link</button>
    </form>
    {#if message}<p class="small error" role="alert">{message}</p>{/if}
    <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={upload} />
  </div>
</Modal>

<style>
  .current {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .actions {
    gap: 0.5rem;
    flex: 1;
  }

  .actions .btn {
    justify-content: flex-start;
  }

  .candidates {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .candidate {
    padding: 0;
    border: 2px solid transparent;
    border-radius: 4px;
    background: var(--surface-2);
    aspect-ratio: 2 / 3;
    overflow: hidden;
  }

  .candidate:hover,
  .candidate:focus-visible {
    border-color: var(--accent);
  }

  .candidate img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .link {
    align-items: flex-end;
    flex-wrap: nowrap;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
