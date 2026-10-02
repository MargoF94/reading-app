<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import AllQuotes from '../components/quotes/AllQuotes.svelte';
  import WordEntry from '../components/vocab/WordEntry.svelte';
  import WordForm from '../components/vocab/WordForm.svelte';
  import { LANGUAGE_NAME } from '../lib/constants';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import type { VocabWord } from '../lib/types';
  import { normalize, plural } from '../lib/util';

  // Two tabs: every learned word (order added by default; A–Z on request), and every saved quote.
  const tab = $derived(router.route.query.get('tab') === 'quotes' ? 'quotes' : 'words');
  const TABS = [
    ['words', 'Words'],
    ['quotes', 'Quotes'],
  ] as const;

  type Sort = 'added' | 'newest' | 'az';
  const sort = $derived<Sort>((['added', 'newest', 'az'] as const).find((s) => s === router.route.query.get('sort')) ?? 'added');
  const lang = $derived(router.route.query.get('lang') ?? '');
  let search = $state('');
  let editing = $state<string | null>(null);

  const languages = $derived([...new Set(library.vocabulary.map((w) => w.language ?? ''))].filter(Boolean));

  const collators = new Map<string, Intl.Collator>();
  const collatorFor = (l = 'en') => {
    if (!collators.has(l)) collators.set(l, new Intl.Collator(l, { sensitivity: 'base', numeric: true }));
    return collators.get(l)!;
  };

  const words = $derived.by(() => {
    const needle = normalize(search.trim());
    let list = library.vocabulary.filter((w) => {
      if (lang && w.language !== lang) return false;
      if (!needle) return true;
      return normalize([w.word, w.note, ...w.senses.map((s) => s.text)].filter(Boolean).join('\n')).includes(needle);
    });
    if (sort === 'newest') list = [...list].reverse();
    if (sort === 'az') {
      list = [...list].sort(
        (a, b) =>
          (a.language ?? '').localeCompare(b.language ?? '') || collatorFor(a.language).compare(a.word, b.word),
      );
    }
    return list;
  });

  // In A–Z order, a letter heading starts each new first letter (per language).
  function initial(w: VocabWord): string {
    return (w.word.normalize('NFD')[0] ?? '').toLocaleUpperCase(w.language);
  }

  async function remove(w: VocabWord) {
    if (!confirm(`Remove “${w.word}”?`)) return;
    await library.deleteWord(w);
  }
</script>

<div class="row head">
  <h1>{tab === 'quotes' ? 'Quotes' : 'Vocabulary'}</h1>
  <span class="small muted">{tab === 'quotes' ? plural(library.quotes.length, 'quote') : plural(library.vocabulary.length, 'word')}</span>
</div>
<div class="seg" role="tablist" aria-label="Show">
  {#each TABS as [t, label] (t)}
    <button type="button" role="tab" aria-selected={tab === t} class:on={tab === t} onclick={() => router.go(t === 'quotes' ? '/words?tab=quotes' : '/words', true)}>{label}</button>
  {/each}
</div>
<p class="small muted intro">
  {tab === 'quotes' ? 'Passages you’ve saved from your books and fics.' : 'Words you’ve learned from your books and fics.'}
</p>

{#if tab === 'quotes'}
  <AllQuotes />
{:else if library.vocabulary.length === 0}
  <div class="empty">
    <p>No words yet.</p>
    <p class="small">Open a book or fic and use <strong>Add a word</strong> in its Words section. The app looks the word up and you choose the meaning to keep.</p>
  </div>
{:else}
  <div class="filters">
    <label class="search">
      <span class="visually-hidden">Search words</span>
      <input type="search" bind:value={search} placeholder="Search words and meanings…" />
    </label>
    <div class="row selects">
      <label>
        <span class="visually-hidden">Sort</span>
        <select value={sort} onchange={(e) => router.setQuery({ sort: e.currentTarget.value === 'added' ? undefined : e.currentTarget.value })}>
          <option value="added">Order added</option>
          <option value="newest">Newest first</option>
          <option value="az">A–Z</option>
        </select>
      </label>
      {#if languages.length > 1}
        <label>
          <span class="visually-hidden">Language</span>
          <select value={lang} onchange={(e) => router.setQuery({ lang: e.currentTarget.value || undefined })}>
            <option value="">All languages</option>
            {#each languages as l (l)}<option value={l}>{LANGUAGE_NAME[l] ?? l}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
  </div>

  {#if words.length === 0}
    <p class="empty">No words match.</p>
  {:else}
    <ol class="words">
      {#each words as w, i (w.id)}
        {@const item = library.item(w.itemId)}
        {#if sort === 'az' && (i === 0 || initial(words[i - 1]) !== initial(w) || words[i - 1].language !== w.language)}
          <li class="letter" aria-hidden="true">{initial(w)}</li>
        {/if}
        <li class="word">
          {#if editing === w.id && item}
            <WordForm {item} word={w} onclose={() => (editing = null)} />
          {:else}
            <WordEntry word={w}>
              {#snippet actions()}
                {#if item}
                  <button type="button" class="btn ghost icon small" aria-label="Edit “{w.word}”" onclick={() => (editing = w.id)}>
                    <Icon name="edit" size={16} />
                  </button>
                {/if}
                <button type="button" class="btn ghost icon small" aria-label="Remove “{w.word}”" onclick={() => remove(w)}>
                  <Icon name="trash" size={16} />
                </button>
              {/snippet}
              {#snippet extra()}
                <p class="from small muted">
                  {#if item}from <a href="#/item/{item.id}">{item.title}</a>{:else}from a deleted item{/if}
                  · {new Date(w.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              {/snippet}
            </WordEntry>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
{/if}

<style>
  .head {
    justify-content: space-between;
    align-items: baseline;
  }

  .intro {
    margin: 0.5rem 0 0;
  }

  .seg {
    display: inline-flex;
    margin-top: 0.4rem;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .seg button {
    border: none;
    background: none;
    font: inherit;
    font-size: 0.9rem;
    padding: 0.35em 1.1em;
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
  }

  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow);
  }

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

  .selects {
    gap: 0.5rem;
  }

  .selects select {
    width: auto;
  }

  .words {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 760px;
  }

  .word {
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--border);
  }

  .letter {
    margin-top: 1rem;
    padding-bottom: 0.2rem;
    font-family: var(--font-serif);
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
  }

  .from {
    margin: 0;
  }
</style>
