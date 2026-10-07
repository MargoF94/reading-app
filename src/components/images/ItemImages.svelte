<script lang="ts">
  import { library } from '../../lib/store.svelte';
  import type { Item, ItemImage } from '../../lib/types';
  import PictureGallery from './PictureGallery.svelte';

  // Pictures kept with a book or fic: character references, maps, fan art…
  let { item }: { item: Item } = $props();

  const current = () => library.item(item.id) ?? item;

  async function save(images: ItemImage[]) {
    await library.saveItem({ ...current(), images });
  }
</script>

<PictureGallery
  images={item.images ?? []}
  ownerId={item.id}
  title={item.title}
  empty="Keep pictures with this {item.type === 'fic' ? 'fic' : 'book'}, such as character references or maps. Upload them from your device or add a link."
  latest={() => current().images ?? []}
  onsave={save}
/>
