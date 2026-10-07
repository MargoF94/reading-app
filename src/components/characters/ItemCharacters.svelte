<script lang="ts">
  import { characterHref } from '../../lib/characters';
  import { library } from '../../lib/store.svelte';
  import type { Character, Item } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import CharacterAvatar from './CharacterAvatar.svelte';
  import CharacterPicker from './CharacterPicker.svelte';

  // A book's characters, each linking to their page.
  let { item }: { item: Item } = $props();

  const chars = $derived((item.characterIds ?? []).map((id) => library.character(id)).filter((c): c is Character => !!c));
  let picking = $state(false);
  let editing = $state(false);
  const current = () => library.item(item.id) ?? item;

  async function add(c: Character) {
    const fresh = current();
    const ids = fresh.characterIds ?? [];
    if (!ids.includes(c.id)) await library.saveItem({ ...fresh, characterIds: [...ids, c.id] });
    picking = false;
  }

  async function remove(c: Character) {
    const fresh = current();
    await library.saveItem({ ...fresh, characterIds: (fresh.characterIds ?? []).filter((id) => id !== c.id) });
  }
</script>

<div class="characters">
  <span class="label">Characters</span>
  <div class="chips">
    {#each chars as c (c.id)}
      <span class="cchip">
        <a href={characterHref(c)}><CharacterAvatar character={c} name={c.name} size={24} /> {c.name}</a>
        {#if editing}
          <button type="button" class="x" aria-label="Remove {c.name} from this book" onclick={() => remove(c)}><Icon name="close" size={14} /></button>
        {/if}
      </span>
    {/each}
    <button type="button" class="cchip add" onclick={() => (picking = true)}><Icon name="plus" size={14} /> Add</button>
    {#if chars.length}
      <button type="button" class="btn ghost small" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>
    {/if}
  </div>
</div>

<CharacterPicker open={picking} exclude={item.characterIds ?? []} onpick={add} onclose={() => (picking = false)} />

<style>
  .characters {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    margin-top: 0.4rem;
  }

  .label {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .cchip {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 999px;
    padding: 2px 0.6rem 2px 2px;
    font-size: 0.9rem;
  }

  .cchip a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text);
    text-decoration: none;
  }

  .add {
    padding: 0.25rem 0.7rem;
    border-style: dashed;
    color: var(--text-2);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .x {
    border: none;
    background: none;
    color: var(--text-2);
    padding: 0 0 0 0.2rem;
    display: inline-flex;
    cursor: pointer;
  }
</style>
