<script lang="ts">
  import { percentOf, type SearchHit, type TocEntry } from '../../lib/reader';
  import type { Quote, ReaderBookmark } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // The book's chapters, your bookmarks and quotes in it, and search inside the book.
  let {
    toc,
    current,
    bookmarks,
    quotes,
    onremovebookmark,
    hits,
    searching,
    searched,
    ongo,
    onsearch,
    onclose,
  }: {
    toc: TocEntry[];
    current?: string;
    bookmarks: ReaderBookmark[];
    quotes: Quote[];
    onremovebookmark: (id: string) => void;
    hits: SearchHit[];
    searching: boolean;
    searched: string;
    ongo: (target: string) => void;
    onsearch: (query: string) => void;
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  type Tab = 'chapters' | 'bookmarks' | 'quotes' | 'search';
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(searched ? 'search' : 'chapters');
  const TABS: [Tab, string][] = [
    ['chapters', 'Chapters'],
    ['bookmarks', 'Bookmarks'],
    ['quotes', 'Quotes'],
    ['search', 'Search'],
  ];
  const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // svelte-ignore state_referenced_locally
  let query = $state(searched);
  let list: HTMLElement | undefined = $state();

  $effect(() => {
    if (tab === 'chapters') list?.querySelector('.on')?.scrollIntoView({ block: 'center' });
  });

  function submit(e: Event) {
    e.preventDefault();
    if (query.trim()) onsearch(query.trim());
  }
</script>

<div class="sheet" role="dialog" aria-label="Contents">
  <div class="row head">
    <h2>Contents</h2>
    <button type="button" class="btn ghost icon" aria-label="Close contents" onclick={onclose}><Icon name="close" /></button>
  </div>
  <div class="seg" role="tablist" aria-label="Show">
    {#each TABS as [t, label] (t)}
      <button type="button" role="tab" aria-selected={tab === t} class:on={tab === t} onclick={() => (tab = t)}>{label}</button>
    {/each}
  </div>

  {#if tab === 'chapters'}
    {#if toc.length}
      <ol class="toc" bind:this={list}>
        {#each toc as t, i (i)}
          <li>
            <button
              type="button"
              class:on={t.href === current}
              aria-current={t.href === current ? 'location' : undefined}
              style:padding-left="{0.2 + t.depth * 1}rem"
              onclick={() => ongo(t.href)}
            >
              <span class="label">{t.label}</span>
              {#if t.fraction !== undefined}<span class="pct">{Math.round(t.fraction * 100)}%</span>{/if}
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="small muted">This book has no table of contents.</p>
    {/if}
  {:else if tab === 'bookmarks'}
    {#if bookmarks.length}
      <ol class="toc marks">
        {#each bookmarks as b (b.id)}
          <li>
            <button type="button" class="mark-row" onclick={() => ongo(b.cfi)}>
              <span class="label">
                <strong>{[b.chapter, `${percentOf(b.fraction)}%`].filter(Boolean).join(' · ')}</strong>
                {#if b.excerpt}<span class="small muted ex">“{b.excerpt}…”</span>{/if}
              </span>
              <span class="pct">{date(b.at)}</span>
            </button>
            <button type="button" class="btn ghost icon small rm" aria-label="Remove bookmark" onclick={() => onremovebookmark(b.id)}>
              <Icon name="close" size={16} />
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="small muted">No bookmarks yet. Tap the middle of a page, then the bookmark at the top.</p>
    {/if}
  {:else if tab === 'quotes'}
    {#if quotes.length}
      <ol class="toc">
        {#each quotes as q (q.id)}
          <li>
            <button type="button" onclick={() => ongo(q.cfi!)}>
              <span class="label">
                <span class="qt">“{q.text.length > 160 ? q.text.slice(0, 160) + '…' : q.text}”</span>
                {#if q.location}<span class="small muted">{q.location}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="small muted">No quotes saved in the reader yet. Select text on a page, then Save quote.</p>
    {/if}
  {:else}
    <form class="search" onsubmit={submit}>
      <label class="visually-hidden" for="book-search">Search in book</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="book-search" type="search" bind:value={query} placeholder="Word or phrase" autofocus enterkeyhint="search" />
      <button type="submit" class="btn" disabled={!query.trim() || searching}><Icon name="search" size={16} /> Search</button>
    </form>
    {#if searching}<p class="small muted" role="status">Searching…</p>{/if}
    {#if hits.length}
      <ol class="hits">
        {#each hits as h (h.cfi)}
          <li>
            <button type="button" onclick={() => ongo(h.cfi)}>
              {#if h.chapter}<span class="small muted">{h.chapter}</span>{/if}
              <span class="ex">{h.pre}<mark>{h.match}</mark>{h.post}</span>
            </button>
          </li>
        {/each}
      </ol>
    {:else if searched && !searching}
      <p class="small muted" role="status">No matches for “{searched}”.</p>
    {/if}
    {#if hits.length && !searching}<p class="small muted">{hits.length === 200 ? 'First 200 matches' : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`}</p>{/if}
  {/if}
</div>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: calc(env(safe-area-inset-top) + 3.5rem);
    z-index: 3;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--text);
    border-radius: 16px 16px 0 0;
    padding: 0.9rem 1.1rem 0;
    box-shadow: 0 -6px 24px rgb(0 0 0 / 0.2);
  }

  @media (min-width: 700px) {
    .sheet {
      left: auto;
      top: 1rem;
      right: 1rem;
      bottom: 1rem;
      width: 400px;
      border-radius: 14px;
    }
  }

  .head {
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 1.2rem;
  }

  .seg {
    display: flex;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 2px;
    margin: 0.6rem 0 0.4rem;
  }

  .seg button {
    flex: 1;
    border: none;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45em 0.2em;
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

  .toc,
  .hits {
    list-style: none;
    margin: 0;
    padding: 0 0 calc(1rem + env(safe-area-inset-bottom));
    overflow-y: auto;
    flex: 1;
  }

  .toc button,
  .hits button {
    width: 100%;
    display: flex;
    gap: 0.6rem;
    justify-content: space-between;
    align-items: baseline;
    text-align: left;
    border: none;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    color: var(--text);
    padding: 0.65rem 0.2rem;
    cursor: pointer;
  }

  .toc button.on {
    color: var(--accent);
    font-weight: 700;
  }

  .label {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .marks li {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .marks .mark-row {
    border-bottom: none;
    flex: 1;
    min-width: 0;
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .ex {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .qt {
    font-family: var(--font-serif);
  }

  .rm {
    flex-shrink: 0;
  }

  .pct {
    font-size: 0.82rem;
    color: var(--text-2);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .hits button {
    flex-direction: column;
    gap: 0.15rem;
  }

  .ex {
    overflow-wrap: anywhere;
    font-size: 0.92rem;
  }

  mark {
    background: var(--accent-soft);
    color: inherit;
    font-weight: 700;
    border-radius: 2px;
  }

  .search {
    display: flex;
    gap: 0.5rem;
    margin: 0.3rem 0 0.4rem;
  }

  .search input {
    flex: 1;
    min-width: 0;
  }
</style>
