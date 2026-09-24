<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import ItemCard from '../components/ItemCard.svelte';
  import { FORMATS, LANGUAGE_NAME, STATUSES } from '../lib/constants';
  import { lastFinishDate } from '../lib/reading';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import type { Author, Item } from '../lib/types';
  import { collator, normalize, plural } from '../lib/util';

  // Filters live in the URL so Back returns to the same view.
  const q = $derived(router.route.query);
  const search = $derived(q.get('q') ?? '');
  const type = $derived(q.get('type') ?? '');
  const status = $derived(q.get('status') ?? '');
  const format = $derived(q.get('format') ?? '');
  const lang = $derived(q.get('lang') ?? '');
  const sort = $derived(q.get('sort') ?? 'added');

  let view = $state<'grid' | 'list'>(readView());
  let showFilters = $state(false);

  function readView(): 'grid' | 'list' {
    try {
      return localStorage.getItem('library-view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  }

  function setView(v: 'grid' | 'list') {
    view = v;
    try {
      localStorage.setItem('library-view', v);
    } catch {
      /* ignore */
    }
  }

  const authorsById = $derived(new Map(library.data.authors.map((a) => [a.id, a])));

  function haystack(item: Item): string {
    const authors = item.authorIds
      .map((id) => authorsById.get(id))
      .filter((a): a is Author => !!a)
      .flatMap((a) => [a.name, ...(a.altNames ?? [])]);
    return normalize(
      [
        item.title,
        item.originalTitle,
        item.titleReading,
        ...authors,
        library.name('series', item.seriesId),
        item.book?.isbn13,
        item.book?.isbn10,
        ...(item.fic?.fandoms ?? []),
        ...(item.fic?.relationships ?? []),
        ...library.names('tags', item.tagIds),
        ...library.names('genres', item.genreIds),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const languages = $derived(
    [...new Set(library.items.map((i) => i.language).filter((l): l is string => !!l))].sort(),
  );

  const results = $derived.by(() => {
    const needle = normalize(search);
    const list = library.items.filter((i) => {
      if (type && i.type !== type) return false;
      if (status && library.status(i.id) !== status) return false;
      if (format && i.book?.format !== format) return false;
      if (lang && i.language !== lang) return false;
      if (needle && !haystack(i).includes(needle)) return false;
      return true;
    });
    const by: Record<string, (a: Item, b: Item) => number> = {
      added: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
      title: (a, b) => collator.compare(a.titleReading || a.title, b.titleReading || b.title),
      author: (a, b) => collator.compare(library.authorNames(a), library.authorNames(b)),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
      read: (a, b) =>
        (lastFinishDate(library.readings(b.id)) ?? '').localeCompare(lastFinishDate(library.readings(a.id)) ?? ''),
    };
    return list.sort(by[sort] ?? by.added);
  });

  const activeFilters = $derived([type, status, format, lang].filter(Boolean).length);
</script>

<div class="row head">
  <h1>Library</h1>
  <span class="muted small">{plural(results.length, 'item')}</span>
</div>

<div class="toolbar">
  <label class="search">
    <span class="visually-hidden">Search</span>
    <Icon name="search" size={18} />
    <input
      type="search"
      placeholder="Search title, author, series, fandom…"
      value={search}
      oninput={(e) => router.setQuery({ q: e.currentTarget.value || undefined })}
    />
  </label>
  <button
    type="button"
    class="btn"
    aria-expanded={showFilters}
    onclick={() => (showFilters = !showFilters)}
  >
    <Icon name="filter" size={18} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
  </button>
  <div class="view" role="group" aria-label="View">
    <button type="button" class="btn icon" class:on={view === 'grid'} aria-label="Grid view" aria-pressed={view === 'grid'} onclick={() => setView('grid')}>
      <Icon name="grid" size={18} />
    </button>
    <button type="button" class="btn icon" class:on={view === 'list'} aria-label="List view" aria-pressed={view === 'list'} onclick={() => setView('list')}>
      <Icon name="list" size={18} />
    </button>
  </div>
</div>

<div class="type-tabs" role="group" aria-label="Type">
  {#each [['', 'All'], ['book', 'Books'], ['fic', 'Fics']] as [v, label] (v)}
    <button type="button" class="chip" class:accent={type === v} onclick={() => router.setQuery({ type: v || undefined })}>
      {label}
    </button>
  {/each}
</div>

{#if showFilters}
  <div class="filters card">
    <label class="field">
      <span>Status</span>
      <select value={status} onchange={(e) => router.setQuery({ status: e.currentTarget.value || undefined })}>
        <option value="">Any</option>
        {#each STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Format</span>
      <select value={format} onchange={(e) => router.setQuery({ format: e.currentTarget.value || undefined })}>
        <option value="">Any</option>
        {#each FORMATS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Language</span>
      <select value={lang} onchange={(e) => router.setQuery({ lang: e.currentTarget.value || undefined })}>
        <option value="">Any</option>
        {#each languages as l (l)}<option value={l}>{LANGUAGE_NAME[l] ?? l}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Sort by</span>
      <select value={sort} onchange={(e) => router.setQuery({ sort: e.currentTarget.value })}>
        <option value="added">Date added</option>
        <option value="read">Date read</option>
        <option value="title">Title</option>
        <option value="author">Author</option>
        <option value="rating">My rating</option>
      </select>
    </label>
    {#if activeFilters}
      <button
        type="button"
        class="btn small ghost"
        onclick={() => router.setQuery({ type: undefined, status: undefined, format: undefined, lang: undefined })}
      >
        Clear filters
      </button>
    {/if}
  </div>
{:else if status}
  <div class="chips" style="margin-bottom:1rem">
    <button type="button" class="chip accent" onclick={() => router.setQuery({ status: undefined })}>
      {STATUSES.find((s) => s.value === status)?.label}
      <Icon name="close" size={14} />
    </button>
  </div>
{/if}

{#if results.length === 0}
  <div class="empty">
    {#if library.items.length === 0}
      <p>Nothing here yet.</p>
      <a class="btn primary" href="#/add">Add a book</a>
    {:else}
      <p>No matches.</p>
    {/if}
  </div>
{:else if view === 'grid'}
  <div class="grid">
    {#each results as item (item.id)}<ItemCard {item} />{/each}
  </div>
{:else}
  <div>
    {#each results as item (item.id)}<ItemCard {item} view="list" />{/each}
  </div>
{/if}

<style>
  .head {
    justify-content: space-between;
    align-items: baseline;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .search {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search :global(svg) {
    position: absolute;
    left: 0.7rem;
    color: var(--text-2);
    pointer-events: none;
  }

  .search input {
    padding-left: 2.3rem;
  }

  .view {
    display: none;
    gap: 0.25rem;
  }

  .view .on {
    background: var(--accent-soft);
    color: var(--accent);
  }

  @media (min-width: 480px) {
    .view {
      display: flex;
    }
  }

  .type-tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .type-tabs .chip {
    border: none;
    padding: 0.35em 0.9em;
    cursor: pointer;
  }

  .chips .chip {
    border: none;
    cursor: pointer;
  }

  .filters {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 1rem;
    align-items: end;
  }

  @media (min-width: 800px) {
    .filters {
      grid-template-columns: repeat(5, 1fr);
    }
  }

  .grid {
    display: grid;
    gap: 1.2rem 1rem;
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 480px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }

  @media (min-width: 1100px) {
    .grid {
      grid-template-columns: repeat(6, 1fr);
    }
  }
</style>
