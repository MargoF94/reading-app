<script lang="ts">
  import { findCovers, type CoverProgress } from '../lib/coverFinder';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import { plural } from '../lib/util';
  import ProgressBar from './ProgressBar.svelte';

  // Looks up missing covers for books (all, or only the given ids).
  let { itemIds = undefined }: { itemIds?: string[] } = $props();

  let running = $state(false);
  let progress = $state<CoverProgress | null>(null);
  let finished = $state(false);
  let searchByTitle = $state(true);
  let ctrl: AbortController | null = null;

  const candidates = $derived(
    library.items.filter((i) => i.type === 'book' && !i.coverUrl && (!itemIds || itemIds.includes(i.id))),
  );

  async function start() {
    running = true;
    finished = false;
    ctrl = new AbortController();
    try {
      progress = await findCovers(
        candidates,
        (item: Item) => library.names('authors', item.authorIds)[0] ?? '',
        (updated) => library.put('items', updated),
        (p) => (progress = p),
        ctrl.signal,
        searchByTitle,
      );
      finished = true;
    } finally {
      running = false;
    }
  }

  $effect(() => () => ctrl?.abort());
</script>

<div class="finder stack">
  {#if running && progress}
    <ProgressBar
      percent={progress.total ? (progress.done / progress.total) * 100 : 0}
      label={`Checked ${progress.done} of ${progress.total} · found ${progress.found}`}
    />
    <div><button type="button" class="btn small" onclick={() => ctrl?.abort()}>Stop</button></div>
  {:else}
    {#if finished && progress}
      <p class="small" role="status">
        Found covers for {plural(progress.found, 'book')}{progress.found < progress.total
          ? `. ${progress.total - progress.found} still have none — you can add a link or a photo in each book’s Edit page.`
          : '.'}
      </p>
    {/if}
    {#if candidates.length}
      <p class="small muted">
        {plural(candidates.length, 'book')} without a cover. Covers come from Open Library (free; matched by ISBN, then by
        title and author).
      </p>
      <label class="check small"><input type="checkbox" bind:checked={searchByTitle} /> Also search by title for books without an ISBN (about one book per second)</label>
      <div><button type="button" class="btn" onclick={start}>Find covers</button></div>
    {:else if !finished}
      <p class="small muted">Every book has a cover.</p>
    {/if}
  {/if}
</div>

<style>
  .finder :global(p) {
    margin: 0;
  }

  .finder {
    gap: 0.75rem;
  }
</style>
