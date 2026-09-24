<script lang="ts">
  import BrowseNav from '../components/BrowseNav.svelte';
  import { browseIndex, kindInfo, type BrowseKind } from '../lib/browse';
  import { normalize, plural } from '../lib/util';

  let { kind }: { kind: BrowseKind } = $props();

  let filter = $state('');
  let sort = $state<'name' | 'count'>('name');

  const info = $derived(kindInfo(kind));
  const entries = $derived(browseIndex(kind));
  const shown = $derived.by(() => {
    const q = normalize(filter);
    const list = q ? entries.filter((e) => normalize(`${e.name} ${e.sub ?? ''}`).includes(q)) : entries;
    return sort === 'count' ? [...list].sort((a, b) => b.count - a.count) : list;
  });
</script>

<h1>{info?.label ?? 'Browse'}</h1>
<BrowseNav current={kind} />

{#if entries.length === 0}
  <p class="empty">Nothing here yet.</p>
{:else}
  <div class="toolbar">
    <input type="search" bind:value={filter} placeholder="Filter {info?.label.toLowerCase()}…" aria-label="Filter" />
    <select bind:value={sort} aria-label="Sort">
      <option value="name">A–Z</option>
      <option value="count">Most items</option>
    </select>
  </div>
  <p class="small muted">{plural(shown.length, info?.singular.toLowerCase() ?? 'entry', info?.label.toLowerCase())}</p>
  <ul class="entries">
    {#each shown as e (e.key)}
      <li>
        <a href="#/browse/{kind}/{encodeURIComponent(e.key)}">
          <span class="name">
            {e.name}
            {#if e.sub}<span class="muted small">· {e.sub}</span>{/if}
          </span>
          <span class="counts small muted">{e.read ? `${e.read} read · ` : ''}{e.count}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .toolbar select {
    width: auto;
  }

  .entries {
    list-style: none;
    margin: 0;
    padding: 0;
    columns: 1;
  }

  @media (min-width: 800px) {
    .entries {
      columns: 2;
      column-gap: 2rem;
    }
  }

  li {
    break-inside: avoid;
    border-bottom: 1px solid var(--border);
  }

  li a {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  li a:hover .name {
    color: var(--accent);
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .counts {
    white-space: nowrap;
  }
</style>
