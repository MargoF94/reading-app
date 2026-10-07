<script lang="ts">
  import { appearances, charKey } from '../../lib/characters';
  import { library } from '../../lib/store.svelte';
  import type { Character } from '../../lib/types';
  import { normalize } from '../../lib/util';
  import Modal from '../Modal.svelte';
  import CharacterAvatar from './CharacterAvatar.svelte';

  // Pick a character for a book: one with a page, one known from fic tags, or a new one.
  let { open, exclude = [], onpick, onclose }: { open: boolean; exclude?: string[]; onpick: (c: Character) => void; onclose: () => void } =
    $props();

  let query = $state('');

  const matches = $derived.by(() => {
    const q = normalize(query.trim());
    return library.characterIndex
      .filter((e) => !(e.character && exclude.includes(e.character.id)))
      .filter((e) => !q || [e.name, ...(e.character?.altNames ?? [])].some((n) => normalize(n).includes(q)))
      .slice(0, 30);
  });
  const exact = $derived(!!query.trim() && library.characterIndex.some((e) => [e.name, ...(e.character?.altNames ?? [])].some((n) => charKey(n) === charKey(query))));

  async function pick(e: (typeof matches)[number]) {
    // Characters only known from fic tags get a page the first time a book adds them.
    const c = e.character ?? (await library.createCharacter(e.name));
    query = '';
    onpick(c);
  }

  async function create() {
    const c = await library.createCharacter(query.trim());
    query = '';
    onpick(c);
  }
</script>

<Modal {open} title="Add a character" {onclose}>
  <label class="visually-hidden" for="char-q">Character name</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="char-q" bind:value={query} placeholder="Name" autocomplete="off" autofocus />
  <ul class="opts">
    {#each matches as e (e.character?.id ?? e.key)}
      <li>
        <button type="button" onclick={() => pick(e)}>
          <CharacterAvatar character={e.character} name={e.name} size={36} />
          <span class="txt">
            <strong>{e.name}</strong>
            <span class="small muted">
              {#if e.character?.altNames.length}also: {e.character.altNames.join(', ')} · {/if}
              {appearances(e.books, e.fics)}{!e.character ? ' (AO3 tag)' : ''}
            </span>
          </span>
        </button>
      </li>
    {/each}
    {#if query.trim() && !exact}
      <li>
        <button type="button" class="new" onclick={create}>
          <span class="plus" aria-hidden="true">+</span>
          <strong>Create “{query.trim()}”</strong>
        </button>
      </li>
    {/if}
  </ul>
  {#if !matches.length && !query.trim()}
    <p class="small muted">No characters yet. Type a name to create one.</p>
  {/if}
</Modal>

<style>
  input {
    width: 100%;
    font-size: 1rem;
  }

  .opts {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }

  .opts button {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.55rem 0.1rem;
    border: none;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .new {
    color: var(--accent) !important;
  }

  .plus {
    width: 36px;
    text-align: center;
    font-size: 1.3rem;
  }
</style>
