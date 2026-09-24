<script lang="ts">
  import BrowseNav from '../components/BrowseNav.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import ItemGrid from '../components/ItemGrid.svelte';
  import StarRating from '../components/StarRating.svelte';
  import { itemsFor, kindInfo, nameOf, recordOf, seriesRows, type BrowseKind } from '../lib/browse';
  import { STATUS_LABEL } from '../lib/constants';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import type { Author, Item, Series } from '../lib/types';
  import { collator, parseNumber, plural } from '../lib/util';

  let { kind, key }: { kind: BrowseKind; key: string } = $props();

  const info = $derived(kindInfo(kind));
  const name = $derived(nameOf(kind, key));
  const record = $derived(recordOf(kind, key));
  const items = $derived(itemsFor(kind, key));
  const readCount = $derived(items.filter((i) => library.status(i.id) === 'read').length);
  const rated = $derived(items.filter((i) => i.rating));
  const avgRating = $derived(rated.length ? rated.reduce((s, i) => s + i.rating!, 0) / rated.length : undefined);

  // Series: reading order with gaps.
  const series = $derived(kind === 'series' ? (record as Series | undefined) : undefined);
  const rows = $derived(kind === 'series' ? seriesRows(items, series?.totalCount) : []);

  // Everything else: currently reading first, then by series, then title.
  const STATUS_ORDER = { 'currently-reading': 0, 'on-hold': 1, 'want-to-read': 2, read: 3, dnf: 4 };
  const sorted = $derived(
    [...items].sort(
      (a: Item, b: Item) =>
        STATUS_ORDER[library.status(a.id)] - STATUS_ORDER[library.status(b.id)] ||
        collator.compare(library.name('series', a.seriesId), library.name('series', b.seriesId)) ||
        parseFloat(a.seriesNumber ?? '0') - parseFloat(b.seriesNumber ?? '0') ||
        collator.compare(a.title, b.title),
    ),
  );

  // Fandoms: most common relationships among its fics.
  const topRelationships = $derived.by(() => {
    if (kind !== 'fandoms') return [];
    const m = new Map<string, number>();
    for (const i of items) for (const r of i.fic?.relationships ?? []) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8);
  });

  let totalDraft = $state('');
  $effect(() => {
    totalDraft = series?.totalCount?.toString() ?? '';
  });

  async function saveTotal() {
    if (!series) return;
    const n = parseNumber(totalDraft);
    await library.put('series', [{ ...series, totalCount: n && n > 0 ? Math.round(n) : undefined }]);
  }
</script>

<div class="top">
  <button type="button" class="btn ghost small" onclick={() => router.back(`/browse/${kind}`)}>
    <Icon name="back" size={18} /> Back
  </button>
</div>

<p class="kind small muted">{info?.singular}</p>
<h1>{name || 'Not found'}</h1>
{#if kind === 'authors' && (record as Author | undefined)?.altNames?.length}
  <p class="muted alt">Also written as {(record as Author).altNames.join(', ')}</p>
{/if}
<p class="summary muted small">
  {plural(items.length, 'item')} · {readCount} read{avgRating ? ` · average rating ${avgRating.toFixed(1)}` : ''}
  {#if series?.totalCount}· {readCount} of {series.totalCount} in the series read{/if}
</p>
<BrowseNav current={kind} />

{#if kind === 'series'}
  <div class="series-total">
    <label for="series-total" class="small">Books in the series</label>
    <input
      id="series-total"
      inputmode="numeric"
      bind:value={totalDraft}
      placeholder="?"
      onchange={saveTotal}
    />
    <span class="small muted">Shows gaps for the ones you don’t have.</span>
  </div>
  <ol class="order">
    {#each rows as row, i (row.item?.id ?? `gap-${row.position}-${i}`)}
      <li class:gap={!row.item}>
        <span class="pos">{row.position !== undefined ? `#${row.position}` : '—'}</span>
        {#if row.item}
          <a class="entry" href="#/item/{row.item.id}">
            <Cover item={row.item} width={44} />
            <span class="info">
              <strong>{row.item.title}</strong>
              <span class="small muted">{library.authorNames(row.item)}</span>
              <span class="small">{STATUS_LABEL[library.status(row.item.id)]}</span>
            </span>
            {#if row.item.rating}<StarRating value={row.item.rating} size={14} />{/if}
          </a>
        {:else}
          <span class="small muted">Not in your library</span>
        {/if}
      </li>
    {/each}
  </ol>
{:else}
  {#if topRelationships.length}
    <div class="chips rel">
      {#each topRelationships as [r, n] (r)}
        <a class="chip" href="#/browse/relationships/{encodeURIComponent(r)}">{r} <span class="muted">{n}</span></a>
      {/each}
    </div>
  {/if}
  {#if items.length}
    <ItemGrid items={sorted} />
  {:else}
    <p class="empty">Nothing here.</p>
  {/if}
{/if}

<style>
  .top {
    margin-bottom: 0.5rem;
  }

  .kind {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.75rem;
  }

  h1 {
    margin: 0.1rem 0 0.2rem;
    overflow-wrap: anywhere;
  }

  .alt,
  .summary {
    margin: 0 0 0.3rem;
  }

  .summary {
    margin-bottom: 1rem;
  }

  .series-total {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .series-total input {
    width: 5rem;
  }

  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 760px;
  }

  .order li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .order li.gap {
    min-height: 3rem;
  }

  .pos {
    width: 3rem;
    flex-shrink: 0;
    font-weight: 600;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .entry:hover strong {
    color: var(--accent);
  }

  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
  }

  .rel {
    margin-bottom: 1.2rem;
  }
</style>
