<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { searchAll, type Hit, type HitKind } from '../lib/search';
  import { library } from '../lib/store.svelte';
  import type { Author, Item, NamedRecord } from '../lib/types';
  import { debounce } from '../lib/util';

  // Search everything: titles and names, quotes, words, and your notes and reviews.
  let query = $state(router.route.query.get('q') ?? '');
  // svelte-ignore state_referenced_locally
  let shown = $state(query); // the query searched (typing is debounced)
  const filter = $derived<HitKind | 'all'>(
    (['item', 'quote', 'word', 'note'] as const).find((k) => k === router.route.query.get('in')) ?? 'all',
  );

  const update = debounce((q: string) => {
    shown = q;
    router.setQuery({ q: q.trim() || undefined });
  }, 200);

  // Names looked up once per search rather than for every item.
  const byId = <T extends NamedRecord>(list: T[]) => new Map(list.filter((r) => !r.deleted).map((r) => [r.id, r]));
  const lookup = $derived({
    authors: byId(library.data.authors as Author[]),
    series: byId(library.data.series),
    genres: byId(library.data.genres),
    tags: byId(library.data.tags),
    publishers: byId(library.data.publishers),
  });

  function facets(item: Item): [string, string][] {
    const L = lookup;
    const out: [string, string][] = [];
    for (const id of item.authorIds) {
      const a = L.authors.get(id);
      if (a) for (const n of [a.name, ...(a.altNames ?? [])]) out.push(['author', n]);
    }
    const series = item.seriesId && L.series.get(item.seriesId)?.name;
    if (series) out.push(['series', series]);
    for (const id of item.genreIds) out.push(['genre', L.genres.get(id)?.name ?? '']);
    for (const id of item.tagIds) out.push(['tag', L.tags.get(id)?.name ?? '']);
    for (const id of item.characterIds ?? []) {
      const c = library.character(id);
      if (c) for (const n of [c.name, ...c.altNames]) out.push(['character', n]);
    }
    const pub = item.book?.publisherId && L.publishers.get(item.book.publisherId)?.name;
    if (pub) out.push(['publisher', pub]);
    const f = item.fic;
    if (f) {
      for (const v of f.fandoms) out.push(['fandom', v]);
      for (const v of f.relationships) out.push(['relationship', v]);
      for (const v of f.characters) out.push(['character', v]);
      for (const v of f.additionalTags) out.push(['tag', v]);
    }
    return out;
  }

  const results = $derived(
    searchAll({ items: library.items, quotes: library.quotes, words: library.vocabulary, facets }, shown),
  );
  const counts = $derived({
    item: results.item.length,
    quote: results.quote.length,
    word: results.word.length,
    note: results.note.length,
  });
  const total = $derived(counts.item + counts.quote + counts.word + counts.note);

  const GROUPS: [HitKind, string][] = [
    ['item', 'Books & fics'],
    ['quote', 'Quotes'],
    ['word', 'Words'],
    ['note', 'Notes & reviews'],
  ];

  const title = (h: Hit) => library.item(h.itemId)?.title ?? 'A deleted item';
  const setFilter = (k: HitKind | 'all') => router.setQuery({ in: k === 'all' ? undefined : k });
</script>

<h1 class="visually-hidden">Search</h1>
<form class="box" role="search" onsubmit={(e) => e.preventDefault()}>
  <Icon name="search" size={20} />
  <label class="visually-hidden" for="q">Search everything</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    id="q"
    type="search"
    bind:value={query}
    oninput={() => update(query)}
    placeholder="Titles, authors, tags, quotes, words, notes…"
    autocomplete="off"
    enterkeyhint="search"
    autofocus
  />
</form>

{#snippet marked(h: Hit)}{h.text.before}<mark>{h.text.match}</mark>{h.text.after}{/snippet}

{#if !shown.trim()}
  <p class="muted small hint">Search your books and fics (titles, authors, series, tags, fandoms), your quotes, your words, and your notes and reviews.</p>
{:else if total === 0}
  <p class="empty">Nothing matches “{shown.trim()}”.</p>
{:else}
  <div class="chips" role="group" aria-label="Show">
    <button type="button" class="chip" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => setFilter('all')}>All {total}</button>
    {#each GROUPS as [k, label] (k)}
      {#if counts[k]}
        <button type="button" class="chip" class:on={filter === k} aria-pressed={filter === k} onclick={() => setFilter(k)}>{label} {counts[k]}</button>
      {/if}
    {/each}
  </div>

  {#each GROUPS as [k, label] (k)}
    {#if counts[k] && (filter === 'all' || filter === k)}
      <section>
        <h2 class="sec">{label}</h2>
        <ul class="hits">
          {#each results[k] as h (h.id)}
            {@const item = library.item(h.itemId)}
            <li>
              <a href="#/item/{h.itemId}" class="hit {k}">
                {#if k === 'item' && item}
                  <Cover {item} width={38} />
                  <span class="body">
                    <strong>{#if h.where}{item.title}{:else}{@render marked(h)}{/if}</strong>
                    <span class="sub">
                      {library.authorNames(item) || (item.type === 'fic' ? 'AO3' : '')}
                      {#if h.where}· {h.where}: {@render marked(h)}{/if}
                    </span>
                  </span>
                {:else if k === 'quote'}
                  <span class="body">
                    <blockquote>{@render marked(h)}</blockquote>
                    <span class="sub">{title(h)}{h.where ? ` · ${h.where}` : ''}</span>
                  </span>
                {:else if k === 'word'}
                  <span class="body">
                    <span>{#if h.where}<strong>{h.where}</strong> — {/if}{@render marked(h)}</span>
                    <span class="sub">from {title(h)}</span>
                  </span>
                {:else}
                  <span class="body">
                    <span>{@render marked(h)}</span>
                    <span class="sub">{h.where} · {title(h)}</span>
                  </span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
{/if}

<style>
  .box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius);
    padding: 0 0.7rem;
    margin-top: 0.4rem;
    color: var(--text-2);
    max-width: 760px;
  }

  .box:focus-within {
    border-color: var(--accent);
  }

  .box input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    font-size: 1.05rem;
    padding: 0.7rem 0;
    outline: none;
    box-shadow: none;
  }

  .hint {
    margin-top: 0.8rem;
    max-width: 640px;
  }

  .chips {
    margin: 0.7rem 0 0.2rem;
  }

  .chip {
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
  }

  .chip.on {
    background: var(--accent);
    color: var(--surface);
    border-color: var(--accent);
  }

  .sec {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-2);
    margin: 1.1rem 0 0.2rem;
  }

  .hits {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 760px;
  }

  .hit {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .sub {
    font-size: 0.82rem;
    color: var(--text-2);
  }

  blockquote {
    margin: 0;
    border-left: 3px solid var(--accent);
    padding-left: 0.6rem;
    font-family: var(--font-serif);
  }

  mark {
    background: var(--accent-soft);
    color: inherit;
    font-weight: 700;
    border-radius: 2px;
  }
</style>
