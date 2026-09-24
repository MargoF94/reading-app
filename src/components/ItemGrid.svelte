<script lang="ts">
  import type { Item } from '../lib/types';
  import ItemCard from './ItemCard.svelte';

  let { items }: { items: Item[] } = $props();
</script>

<div class="grid">
  {#each items as item (item.id)}<ItemCard {item} />{/each}
</div>

<style>
  .grid {
    display: grid;
    gap: 1.2rem 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 480px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }

  @media (min-width: 1100px) {
    .grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
