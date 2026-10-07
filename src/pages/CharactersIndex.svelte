<script lang="ts">
  import BrowseNav from '../components/BrowseNav.svelte';
  import CharacterAvatar from '../components/characters/CharacterAvatar.svelte';
  import { appearances, characterHref } from '../lib/characters';
  import { library } from '../lib/store.svelte';
  import { normalize } from '../lib/util';

  // Every character: pages you've made, and fic character tags without a page yet.
  let query = $state('');
  const list = $derived.by(() => {
    const q = normalize(query.trim());
    return library.characterIndex.filter((e) => !q || [e.name, ...(e.character?.altNames ?? [])].some((n) => normalize(n).includes(q)));
  });
</script>

<h1>Library</h1>
<BrowseNav current="characters" />

<label class="visually-hidden" for="cq">Search characters</label>
<input id="cq" type="search" class="search" bind:value={query} placeholder="Search characters…" autocomplete="off" />

{#if library.characterIndex.length === 0}
  <div class="empty">
    <p>No characters yet.</p>
    <p class="small">Add characters from a book’s page, or import fics: their AO3 character tags appear here.</p>
  </div>
{:else if list.length === 0}
  <p class="empty">No characters match.</p>
{:else}
  <ul class="list">
    {#each list as e (e.character?.id ?? e.key)}
      <li>
        <a href={characterHref(e.character, e.name)}>
          <CharacterAvatar character={e.character} name={e.name} size={40} />
          <span class="body">
            <strong>{e.name}</strong>
            <span class="small muted">{appearances(e.books, e.fics)}{e.character ? '' : ' · no page yet'}</span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .search {
    width: 100%;
    max-width: 760px;
    margin: 0.6rem 0 0.3rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 760px;
  }

  .list a {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
  }

  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
