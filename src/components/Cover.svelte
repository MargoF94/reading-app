<script lang="ts">
  import { coverSrc, isRepoCover } from '../lib/covers';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import PlaceholderCover from './PlaceholderCover.svelte';

  // `preview` shows an image that isn't saved yet (e.g. a photo picked in the form).
  // `width` is in pixels, or any CSS length (e.g. one that changes with screen size).
  let { item, width = 120, preview = undefined }: { item: Item; width?: number | string; preview?: string } = $props();

  let src = $state<string | null>(null);
  let failed = $state(false);
  const author = $derived(library.authorNames(item));
  const series = $derived(item.seriesId ? library.name('series', item.seriesId) : undefined);

  const url = $derived(preview ?? item.coverUrl);

  $effect(() => {
    const u = url;
    failed = false;
    src = null;
    if (!u) return;
    if (!isRepoCover(u)) {
      src = u;
      return;
    }
    let cancelled = false;
    coverSrc(u).then((s) => {
      if (cancelled) return;
      src = s;
      failed = !s;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="cover" style:width={typeof width === 'number' ? `${width}px` : width}>
  {#if src && !failed}
    <img {src} alt="" loading="lazy" onerror={() => (failed = true)} />
  {:else if url && !failed}
    <!-- The picture is on its way. -->
  {:else}
    <PlaceholderCover {item} {author} {series} />
  {/if}
</div>

<style>
  .cover {
    aspect-ratio: 2 / 3;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: var(--shadow);
    text-decoration: none;
    flex-shrink: 0;
    background: var(--surface-2);
    container-type: inline-size;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
