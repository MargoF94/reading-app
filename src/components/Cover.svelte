<script lang="ts">
  import { coverSrc, isRepoCover } from '../lib/covers';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import { hashHue } from '../lib/util';

  // `preview` shows an image that isn't saved yet (e.g. a photo picked in the form).
  // `width` is in pixels, or any CSS length (e.g. one that changes with screen size).
  let { item, width = 120, preview = undefined }: { item: Item; width?: number | string; preview?: string } = $props();

  let src = $state<string | null>(null);
  let failed = $state(false);
  const hue = $derived(hashHue(item.fic?.fandoms[0] ?? item.title));
  const author = $derived(library.authorNames(item));

  $effect(() => {
    const url = preview ?? item.coverUrl;
    failed = false;
    src = null;
    if (!url) return;
    if (!isRepoCover(url)) {
      src = url;
      return;
    }
    let cancelled = false;
    coverSrc(url).then((s) => {
      if (!cancelled) src = s;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="cover" style:width={typeof width === 'number' ? `${width}px` : width} style:--hue={hue}>
  {#if src && !failed}
    <img {src} alt="" loading="lazy" onerror={() => (failed = true)} />
  {:else}
    <div class="generated" class:fic={item.type === 'fic'}>
      <span class="title">{item.title}</span>
      {#if author}<span class="author">{author}</span>{/if}
      {#if item.type === 'fic'}<span class="badge">AO3</span>{/if}
    </div>
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

  .generated {
    height: 100%;
    text-decoration: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.3em;
    padding: 9cqw;
    background: linear-gradient(160deg, hsl(var(--hue) var(--cover-s) var(--cover-l1)), hsl(calc(var(--hue) + 25) calc(var(--cover-s) + 4%) var(--cover-l2)));
    color: #eef1f3;
    font-family: var(--font-serif);
    overflow: hidden;
  }

  .title {
    font-size: max(10px, 12cqw);
    line-height: 1.15;
    font-weight: 600;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .author {
    font-size: max(9px, 9cqw);
    opacity: 0.85;
    font-family: var(--font);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .badge {
    align-self: flex-start;
    font-family: var(--font);
    font-size: max(8px, 8cqw);
    font-weight: 700;
    letter-spacing: 0.05em;
    background: rgb(255 255 255 / 0.2);
    border-radius: 3px;
    padding: 0 0.4em;
  }
</style>
