<script lang="ts">
  import { quoteText } from '../../lib/quotes';
  import { library } from '../../lib/store.svelte';
  import type { Item, Quote } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import QuoteActions from './QuoteActions.svelte';
  import QuoteEntry from './QuoteEntry.svelte';
  import QuoteForm from './QuoteForm.svelte';

  // Quotes saved from this book or fic, in the order they were added.
  let { item }: { item: Item } = $props();

  const quotes = $derived(library.quotesFor(item.id));
  let editing = $state<string | null>(null); // quote id, or 'new'

  const source = $derived({ title: item.title, by: library.authorNames(item) });
</script>

<section>
  <div class="row head">
    <h2>Quotes</h2>
    <div class="row">
      {#if library.quotes.length}<a class="small" href="#/words?tab=quotes">All quotes</a>{/if}
      {#if editing !== 'new'}
        <button type="button" class="btn ghost small" onclick={() => (editing = 'new')}><Icon name="plus" size={16} /> Add a quote</button>
      {/if}
    </div>
  </div>

  {#if editing === 'new'}
    <QuoteForm {item} onclose={() => (editing = null)} />
  {/if}

  {#if quotes.length}
    <ol class="quotes">
      {#each quotes as q (q.id)}
        <li>
          {#if editing === q.id}
            <QuoteForm {item} quote={q} onclose={() => (editing = null)} />
          {:else}
            <QuoteEntry quote={q} lang={item.language}>
              {#snippet actions()}
                <QuoteActions quote={q} copyText={quoteText(q, source)} onedit={() => (editing = q.id)} />
              {/snippet}
            </QuoteEntry>
          {/if}
        </li>
      {/each}
    </ol>
  {:else if editing !== 'new'}
    <p class="muted small">No quotes yet. Save passages from this {item.type === 'fic' ? 'fic' : 'book'} you want to keep.</p>
  {/if}
</section>

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.4rem;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  .quotes {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .quotes > li {
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--border);
  }

  .quotes > li:last-child {
    border-bottom: none;
  }
</style>
