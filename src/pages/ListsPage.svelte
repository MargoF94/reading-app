<script lang="ts">
  import BrowseNav from '../components/BrowseNav.svelte';
  import Cover from '../components/Cover.svelte';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import { plural } from '../lib/util';

  let name = $state('');
  let description = $state('');
  let creating = $state(false);

  const cards = $derived(
    library.lists.map((l) => ({
      list: l,
      items: l.entries.map((e) => library.item(e.itemId)).filter((i): i is Item => !!i),
    })),
  );

  async function create(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    const list = await library.createList(name, description.trim() || undefined);
    name = '';
    description = '';
    creating = false;
    router.go(`/list/${list.id}`);
  }
</script>

<div class="row head">
  <h1>Lists</h1>
  {#if !creating}<button type="button" class="btn primary" onclick={() => (creating = true)}>+ New list</button>{/if}
</div>
<BrowseNav current="lists" />

{#if creating}
  <form class="card stack new" onsubmit={create}>
    <label class="field"><span>Name</span><input bind:value={name} placeholder="e.g. Top 10 of 2025" required /></label>
    <label class="field">
      <span>Description (optional)</span>
      <textarea bind:value={description} rows="2"></textarea>
    </label>
    <div class="row">
      <button class="btn primary" disabled={!name.trim()}>Create list</button>
      <button type="button" class="btn" onclick={() => (creating = false)}>Cancel</button>
    </div>
  </form>
{/if}

{#if cards.length === 0 && !creating}
  <div class="empty">
    <p>No lists yet. Lists are ordered collections with notes — a ranking, a “buy in Japan” list, a reading plan.</p>
    <p class="small">You can also add a book to a list from its page.</p>
  </div>
{:else}
  <div class="lists">
    {#each cards as { list, items } (list.id)}
      <a class="card list-card" href="#/list/{list.id}">
        <div class="covers" aria-hidden="true">
          {#each items.slice(0, 4) as item (item.id)}<Cover {item} width={52} />{/each}
        </div>
        <div class="info">
          <strong>{list.name}</strong>
          <span class="small muted">{plural(items.length, 'item')}</span>
          {#if list.description}<span class="small desc">{list.description}</span>{/if}
        </div>
      </a>
    {/each}
  </div>
{/if}

<style>
  .head {
    justify-content: space-between;
    align-items: baseline;
  }

  .new {
    max-width: 560px;
    margin-bottom: 1.5rem;
  }

  .lists {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 700px) {
    .lists {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .list-card {
    display: flex;
    gap: 1rem;
    color: inherit;
    text-decoration: none;
    align-items: center;
  }

  .list-card:hover strong {
    color: var(--accent);
  }

  .covers {
    display: flex;
    flex-shrink: 0;
    min-width: 52px;
    min-height: 78px;
  }

  .covers :global(.cover + .cover) {
    margin-left: -30px;
  }

  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
