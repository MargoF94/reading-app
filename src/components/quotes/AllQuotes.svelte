<script lang="ts">
  import { filterQuotes, QUOTE_SORTS, quoteText, type QuoteSort, type QuoteSource } from '../../lib/quotes';
  import { router } from '../../lib/router.svelte';
  import { library } from '../../lib/store.svelte';
  import Cover from '../Cover.svelte';
  import QuoteActions from './QuoteActions.svelte';
  import QuoteEntry from './QuoteEntry.svelte';
  import QuoteForm from './QuoteForm.svelte';

  // Every saved quote. Order added by default; newest first or by book on request.
  const sort = $derived<QuoteSort>(QUOTE_SORTS.find((s) => s === router.route.query.get('sort')) ?? 'added');
  let search = $state('');
  let editing = $state<string | null>(null);

  const sources = $derived.by(() => {
    const map = new Map<string, QuoteSource>();
    for (const q of library.quotes) {
      const item = library.item(q.itemId);
      if (item && !map.has(item.id)) map.set(item.id, { title: item.title, by: library.authorNames(item) });
    }
    return map;
  });

  const quotes = $derived(filterQuotes(library.quotes, (id) => sources.get(id), search, sort));

  const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
</script>

{#if library.quotes.length === 0}
  <div class="empty">
    <p>No quotes yet.</p>
    <p class="small">Open a book or fic and use <strong>Add a quote</strong> in its Quotes section.</p>
  </div>
{:else}
  <div class="filters">
    <label class="search">
      <span class="visually-hidden">Search quotes</span>
      <input type="search" bind:value={search} placeholder="Search quotes, notes, titles…" />
    </label>
    <label>
      <span class="visually-hidden">Sort</span>
      <select value={sort} onchange={(e) => router.setQuery({ sort: e.currentTarget.value === 'added' ? undefined : e.currentTarget.value })}>
        <option value="added">Order added</option>
        <option value="newest">Newest first</option>
        <option value="item">By book or fic</option>
      </select>
    </label>
  </div>

  {#if quotes.length === 0}
    <p class="empty">No quotes match.</p>
  {:else}
    <ol class="quotes">
      {#each quotes as q, i (q.id)}
        {@const item = library.item(q.itemId)}
        {#if sort === 'item' && (i === 0 || quotes[i - 1].itemId !== q.itemId)}
          <li class="group">
            {#if item}
              <a href="#/item/{item.id}" class="group-link">
                <Cover {item} width={34} />
                <span>
                  <strong>{item.title}</strong>
                  {#if sources.get(item.id)?.by}<span class="small muted">{sources.get(item.id)?.by}</span>{/if}
                </span>
              </a>
            {:else}
              <strong class="muted">A deleted item</strong>
            {/if}
          </li>
        {/if}
        <li class="quote">
          {#if editing === q.id && item}
            <QuoteForm {item} quote={q} onclose={() => (editing = null)} />
          {:else}
            <QuoteEntry quote={q} lang={item?.language}>
              {#snippet actions()}
                <QuoteActions quote={q} copyText={quoteText(q, sources.get(q.itemId))} onedit={item ? () => (editing = q.id) : undefined} />
              {/snippet}
              {#snippet extra()}
                <p class="from small muted">
                  {#if sort !== 'item'}
                    {#if item}from <a href="#/item/{item.id}">{item.title}</a>{:else}from a deleted item{/if} ·
                  {/if}
                  {date(q.createdAt)}
                </p>
              {/snippet}
            </QuoteEntry>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.6rem 0 0.4rem;
  }

  .search {
    flex: 1 1 260px;
  }

  .search input {
    width: 100%;
  }

  .filters select {
    width: auto;
  }

  .quotes {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 760px;
  }

  .quote {
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--border);
  }

  .group {
    margin-top: 1.1rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
  }

  .group-link {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: inherit;
    text-decoration: none;
  }

  .group-link > span {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .from {
    margin: 0;
    padding-left: calc(0.8rem + 3px);
  }
</style>
