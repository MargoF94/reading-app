<script lang="ts">
  import { deviceFiles } from '../../lib/deviceFiles.svelte';
  import { percentOf, readableFile } from '../../lib/reader';
  import { sync } from '../../lib/sync.svelte';
  import type { Item } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // "Read" / "Continue reading · 42%" under the cover, when the book has an EPUB.
  let { item }: { item: Item } = $props();

  const file = $derived(readableFile(item));
  const usable = $derived(!!file && (!!sync.config || deviceFiles.has(file)));
  const pos = $derived(file?.position);

  $effect(() => void deviceFiles.load());
</script>

{#if file && usable}
  <a class="btn primary read" href="#/read/{item.id}/{file.id}">
    <Icon name="book" size={18} />
    {#if pos && pos.fraction > 0}
      <span>Continue reading <span class="pct">· {percentOf(pos.fraction)}%</span></span>
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
