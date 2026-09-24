<script lang="ts">
  import BarList from '../components/charts/BarList.svelte';
  import ColumnChart from '../components/charts/ColumnChart.svelte';
  import StatTile from '../components/charts/StatTile.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import { compact, computeStats } from '../lib/stats';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { formatDate, formatMoney, formatNumber, today } from '../lib/util';
  import { renderYearImage } from '../lib/yearImage';

  let { year }: { year: number } = $props();

  const stats = $derived(
    computeStats(library.data, library.settings, { period: { from: `${year}-01-01`, to: `${year}-12-31` }, today: today() }),
  );
  const years = $derived.by(() => {
    const ys = new Set<number>([new Date().getFullYear()]);
    for (const r of library.data.readings) if (!r.deleted && r.outcome === 'finished' && r.finishDate) ys.add(Number(r.finishDate.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  });
  const finishedItems = $derived([...new Map(stats.finished.map((f) => [f.item.id, f.item])).values()]);
  const total = $derived(stats.finishedBooks + stats.finishedFics);
  const favourites = $derived(
    finishedItems.filter((i) => i.rating && i.rating >= 4.5).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 6),
  );
  const first = $derived(stats.finished[0]);
  const last = $derived(stats.finished.at(-1));
  const currency = $derived(library.settings.displayCurrency);
  const coverSize = $derived(finishedItems.length > 40 ? 56 : 72);

  let making = $state(false);

  async function saveImage() {
    making = true;
    try {
      const blob = await renderYearImage(year, stats, finishedItems);
      const file = new File([blob], `year-in-books-${year}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `My ${year} in books` });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toasts.show(e instanceof Error ? e.message : 'Couldn’t create the image.', 'error');
    } finally {
      making = false;
    }
  }
</script>

<div class="row head">
  <a href="#/stats" class="small">← Stats</a>
  <label class="small">
    <span class="visually-hidden">Year</span>
    <select value={year} onchange={(e) => router.go(`/stats/year/${e.currentTarget.value}`, true)}>
      {#each years as y (y)}<option value={y}>{y}</option>{/each}
    </select>
  </label>
</div>

<section class="hero">
  <p class="eyebrow">Year in books</p>
  <h1>{year}</h1>
  <p class="big">{formatNumber(total)}</p>
  <p class="big-label">
    {total === 1 ? 'book or fic' : 'books and fics'} finished{year === new Date().getFullYear() ? ' so far' : ''}
  </p>
  {#if total}
    <button type="button" class="btn save" disabled={making} onclick={saveImage}>
      <Icon name="download" size={18} /> {making ? 'Making image…' : 'Save as image'}
    </button>
  {/if}
</section>

{#if total === 0}
  <p class="empty">Nothing finished in {year} yet.</p>
{:else}
  <div class="tiles">
    <StatTile label="Books" value={formatNumber(stats.finishedBooks)} />
    <StatTile label="Fics" value={formatNumber(stats.finishedFics)} />
    <StatTile label="Pages" value={compact(stats.pages)} />
    <StatTile label="Words" value={compact(stats.words)} />
    {#if stats.minutes}<StatTile label="Hours listened" value={formatNumber(Math.round(stats.minutes / 60))} />{/if}
    <StatTile label="Average rating" value={stats.avgRating ? stats.avgRating.toFixed(2) : '—'} />
    {#if stats.spent.total}<StatTile label="Spent" value={formatMoney(stats.spent.total, currency)} />{/if}
    {#if stats.dnf}<StatTile label="Did not finish" value={formatNumber(stats.dnf)} />{/if}
  </div>

  <section class="wall-section">
    <h2>Everything you finished</h2>
    <div class="wall" style:--size="{coverSize}px">
      {#each finishedItems as item (item.id)}
        <a href="#/item/{item.id}" title={item.title}><Cover {item} width={coverSize} /></a>
      {/each}
    </div>
  </section>

  <div class="highlights">
    {#if favourites.length}
      <section class="card">
        <h3>Favourites</h3>
        <ul class="plain">
          {#each favourites as f (f.id)}<li><a href="#/item/{f.id}">{f.title}</a> <span class="muted small">{f.rating}★</span></li>{/each}
        </ul>
      </section>
    {/if}
    <section class="card">
      <h3>Records</h3>
      <dl>
        {#if stats.longestBook}<dt>Longest book</dt><dd><a href="#/item/{stats.longestBook.item.id}">{stats.longestBook.item.title}</a> · {formatNumber(stats.longestBook.pages)} p.</dd>{/if}
        {#if stats.shortestBook && stats.shortestBook.item !== stats.longestBook?.item}<dt>Shortest book</dt><dd><a href="#/item/{stats.shortestBook.item.id}">{stats.shortestBook.item.title}</a> · {formatNumber(stats.shortestBook.pages)} p.</dd>{/if}
        {#if stats.longestFic}<dt>Longest fic</dt><dd><a href="#/item/{stats.longestFic.item.id}">{stats.longestFic.item.title}</a> · {compact(stats.longestFic.words)} words</dd>{/if}
        {#if stats.authors[0]}<dt>Most-read author</dt><dd>{stats.authors[0].name} · {stats.authors[0].count}</dd>{/if}
        {#if first}<dt>First finished</dt><dd><a href="#/item/{first.item.id}">{first.item.title}</a> · {formatDate(first.reading.finishDate)}</dd>{/if}
        {#if last && last !== first}<dt>Last finished</dt><dd><a href="#/item/{last.item.id}">{last.item.title}</a> · {formatDate(last.reading.finishDate)}</dd>{/if}
        {#if stats.avgDays}<dt>Average time to finish</dt><dd>{Math.round(stats.avgDays)} days</dd>{/if}
      </dl>
    </section>
    <section class="card">
      <ColumnChart
        title="Finished each month"
        labels={stats.buckets.map((b) => b.label)}
        series={[
          { name: 'Books', color: 'var(--series-1)', values: stats.buckets.map((b) => b.books) },
          { name: 'Fics', color: 'var(--series-2)', values: stats.buckets.map((b) => b.fics) },
        ]}
      />
    </section>
    {#if stats.genres.length}<section class="card"><BarList title="Top genres" rows={stats.genres.slice(0, 6)} /></section>{/if}
    {#if stats.fandoms.length}<section class="card"><BarList title="Top fandoms" rows={stats.fandoms.slice(0, 6)} /></section>{/if}
    <section class="card"><BarList title="Languages" rows={stats.languages} /></section>
  </div>
{/if}

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .head select {
    width: auto;
  }

  .hero {
    text-align: center;
    padding: 1.5rem 1rem 1rem;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.75rem;
    color: var(--text-2);
  }

  .hero h1 {
    margin: 0.2rem 0 0.8rem;
    font-size: 2rem;
  }

  .big {
    font-family: var(--font);
    font-size: 3.5rem;
    font-weight: 600;
    line-height: 1;
    margin: 0;
  }

  .big-label {
    color: var(--text-2);
    margin: 0.3rem 0 0;
  }

  .save {
    margin-top: 1rem;
  }

  .tiles {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 1.5rem 0;
  }

  @media (min-width: 700px) {
    .tiles {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--size), 1fr));
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .wall a :global(.cover) {
    width: 100% !important;
  }

  .highlights {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 900px) {
    .highlights {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  .plain {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
    font-size: 0.9rem;
  }

  dt {
    color: var(--text-2);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
