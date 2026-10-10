<script lang="ts">
  import { deviceFiles } from '../../lib/deviceFiles.svelte';
  import { loggedPlace, percentOf, readableFile } from '../../lib/reader';
  import { library } from '../../lib/store.svelte';
  import { sync } from '../../lib/sync.svelte';
  import type { Item } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // "Read" / "Continue reading · 42%" under the cover, when the book has an EPUB.
  let { item }: { item: Item } = $props();

  const file = $derived(readableFile(item));
  const usable = $derived(!!file && (!!sync.config || deviceFiles.has(file)));
  // Progress logged by hand since the reader last moved is where the book opens.
  const logged = $derived(file ? loggedPlace(item, library.readings(item.id), file.position) : undefined);
  const nextChapter = $derived(
    logged?.chaptersRead !== undefined && logged.chapters && logged.chaptersRead < logged.chapters
      ? Math.floor(logged.chaptersRead) + 1
      : undefined,
  );
  // A logged percent shows as logged (58%, not 57.99…% rounded down).
  const percent = $derived(logged ? Math.round(logged.fraction * 100) : percentOf(file?.position?.fraction ?? 0));

  $effect(() => void deviceFiles.load());
</script>

{#if file && usable}
  <a class="btn primary read" href="#/read/{item.id}/{file.id}">
    <Icon name="book" size={18} />
    {#if nextChapter}
      <span>Continue reading <span class="pct">· ch. {nextChapter}</span></span>
    {:else if percent > 0 || (file?.position?.fraction ?? 0) > 0}
      <span>Continue reading <span class="pct">· {percent}%</span></span>
    {:else}
      <span>Read</span>
    {/if}
  </a>
{/if}

<style>
  .read {
    width: 100%;
    justify-content: center;
    text-align: center;
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
    text-decoration: none;
  }

  .pct {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
