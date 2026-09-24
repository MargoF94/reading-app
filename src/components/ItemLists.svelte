<script lang="ts">
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Item } from '../lib/types';
  import Combobox from './Combobox.svelte';

  // The lists an item is on, plus adding it to another (or a new) list.
  let { item }: { item: Item } = $props();

  const onLists = $derived(library.listsContaining(item.id));
  const options = $derived(
    library.lists.filter((l) => !onLists.includes(l)).map((l) => ({ value: l.id, label: l.name })),
  );

  async function add(listId: string | undefined) {
    const list = listId ? library.list(listId) : undefined;
    if (!list) return;
    await library.addToList(list, item.id);
    toasts.show(`Added to “${list.name}”.`);
  }

  async function create(name: string): Promise<string> {
    const list = await library.createList(name);
    return list.id;
  }
</script>

<section>
  <h2>Lists</h2>
  {#if onLists.length}
    <div class="chips">
      {#each onLists as l (l.id)}<a class="chip" href="#/list/{l.id}">{l.name}</a>{/each}
    </div>
  {/if}
  <div class="add">
    <label class="label" for="add-to-list">Add to a list</label>
    <Combobox
      id="add-to-list"
      {options}
      value={undefined}
      clearable={false}
      placeholder={library.lists.length ? 'Choose a list, or type a new name…' : 'Type a name for a new list…'}
      oncreate={create}
      onchange={add}
    />
  </div>
</section>

<style>
  h2 {
    margin-bottom: 0.5rem;
  }

  .add {
    margin-top: 0.6rem;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
</style>
