<script lang="ts">
  import { STATUS_LABEL, FORMAT_LABEL } from '../lib/constants';
  import { activeReading, entryPercent, latestEntry } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import Cover from './Cover.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import StarRating from './StarRating.svelte';

  let { item, view = 'grid' }: { item: Item; view?: 'grid' | 'list' } = $props();

  const status = $derived(library.status(item.id));
  const percent = $derived.by(() => {
    if (status !== 'currently-reading' && status !== 'on-hold') return undefined;
    return entryPercent(item, latestEntry(activeReading(library.readings(item.id)))) ?? 0;
  });
  const kind = $derived(item.type === 'fic' ? 'Fic' : item.book?.format ? FORMAT_LABEL[item.book.format] : 'Book');
</script>

<a class="card-link {view}" href="#/item/{item.id}">
  <Cover {item} width={view === 'grid' ? 160 : 56} />
  <div class="info">
    <span class="title">{item.title}</span>
    <span class="author small muted">{library.authorNames(item)}</span>
    {#if view === 'list'}
      <span class="small muted">{kind} · {STATUS_LABEL[status]}</span>
    {/if}
    {#if item.rating}<StarRating value={item.rating} size={view === 'grid' ? 14 : 15} />{/if}
    {#if percent !== undefined}<ProgressBar {percent} />{/if}
  </div>
</a>

<style>
  .card-link {
    color: inherit;
    text-decoration: none;
    display: flex;
    min-width: 0;
  }

  .grid {
    flex-direction: column;
    gap: 0.5rem;
  }

  .grid :global(.cover) {
    width: 100% !important;
  }

  .list {
    gap: 0.8rem;
    align-items: center;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }

  .title {
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .author {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-link:hover .title {
    color: var(--accent);
  }
</style>
