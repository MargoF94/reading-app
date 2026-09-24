<script lang="ts">
  import BarList from '../components/charts/BarList.svelte';
  import ColumnChart, { type ColumnSeries } from '../components/charts/ColumnChart.svelte';
  import StatTile from '../components/charts/StatTile.svelte';
  import GoalsCard from '../components/GoalsCard.svelte';
  import { bookEquivalentWords, compact, computeStats, PRESETS, presetPeriod, type Period, type PresetId } from '../lib/stats';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import type { ItemType } from '../lib/types';
  import { formatDate, formatMoney, formatNumber, normalize, today } from '../lib/util';

  // Filters live in the URL (?p=…&t=…&from=…&to=…) so Back keeps them.
  const q = $derived(router.route.query);
  const preset = $derived((q.get('p') ?? 'this-year') as PresetId | 'custom');
  const type = $derived<ItemType | undefined>(q.get('t') === 'book' || q.get('t') === 'fic' ? (q.get('t') as ItemType) : undefined);
  const period = $derived<Period>(
    preset === 'custom'
      ? orderRange(q.get('from') || undefined, q.get('to') || undefined)
      : presetPeriod(preset, today()),
  );
  function orderRange(from?: string, to?: string): Period {
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  const stats = $derived(computeStats(library.data, library.settings, { period, type, today: today() }));
  const year = new Date().getFullYear();
  const currency = $derived(library.settings.displayCurrency);

  const finishedSeries = $derived.by(() => {
    const out: ColumnSeries[] = [];
    if (type !== 'fic') out.push({ name: 'Books', color: 'var(--series-1)', values: stats.buckets.map((b) => b.books) });
    if (type !== 'book') out.push({ name: 'Fics', color: 'var(--series-2)', values: stats.buckets.map((b) => b.fics) });
    return out;
  });
  const labels = $derived(stats.buckets.map((b) => b.label));
  const perLabel = $derived(stats.monthly ? 'each month' : 'each year');

  const estimatedShare = $derived(stats.words ? Math.round((stats.wordsEstimated / stats.words) * 100) : 0);
  const money = (n: number) => formatMoney(n, currency);
  const spentOther = $derived(
    Object.entries(stats.spent.perCurrency)
      .filter(([c]) => c !== currency)
      .map(([c, v]) => formatMoney(v!, c as typeof currency))
      .join(' + '),
  );

  // Links from the breakdowns to their browse pages.
  const idByName = (coll: 'genres' | 'authors' | 'publishers', name: string) =>
    library.named(coll).find((r) => normalize(r.name) === normalize(name))?.id;
  const link = (kind: string, coll?: 'genres' | 'authors' | 'publishers') => (name: string) => {
    const key = coll ? idByName(coll, name) : name;
    return key ? `#/browse/${kind}/${encodeURIComponent(key)}` : undefined;
  };

  function setPreset(p: PresetId | 'custom') {
    if (p === 'custom') {
      // Start from the period being viewed, so the dates are never empty.
      const from = period.from ?? `${year}-01-01`;
      const to = period.to && period.to < today() ? period.to : today();
      router.setQuery({ p, from: q.get('from') || from, to: q.get('to') || to });
    } else router.setQuery({ p: p === 'this-year' ? undefined : p, from: undefined, to: undefined });
  }

  const bookWords = $derived(bookEquivalentWords(library.settings));
  const ficBooks = $derived(stats.ficWords / bookWords);
  const periodLabel = $derived(
    period.from || period.to
      ? `${period.from ? formatDate(period.from) : 'the start'} – ${period.to ? formatDate(period.to > today() ? today() : period.to) : 'today'}`
      : 'all time',
  );
</script>

<div class="row head">
  <h1>Stats</h1>
  <a href="#/stats/year/{year}">Your {year} in books →</a>
</div>

<div class="filters" role="group" aria-label="Filters">
  <div class="presets">
    {#each PRESETS as p (p.id)}
      <button type="button" class="chip" class:accent={preset === p.id} aria-pressed={preset === p.id} onclick={() => setPreset(p.id)}>
        {p.label}
      </button>
    {/each}
    <button type="button" class="chip" class:accent={preset === 'custom'} aria-pressed={preset === 'custom'} onclick={() => setPreset('custom')}>
      Custom dates
    </button>
  </div>
  <select value={type ?? ''} onchange={(e) => router.setQuery({ t: e.currentTarget.value || undefined })} aria-label="Books or fics">
    <option value="">Books &amp; fics</option>
    <option value="book">Books only</option>
    <option value="fic">Fics only</option>
  </select>
</div>
{#if preset === 'custom'}
  <div class="custom">
    <label class="field"><span>From</span><input type="date" value={q.get('from') ?? ''} max={q.get('to') ?? undefined} onchange={(e) => router.setQuery({ from: e.currentTarget.value || undefined })} /></label>
    <label class="field"><span>To</span><input type="date" value={q.get('to') ?? ''} min={q.get('from') ?? undefined} onchange={(e) => router.setQuery({ to: e.currentTarget.value || undefined })} /></label>
  </div>
{/if}
<p class="small muted period">Showing {periodLabel}</p>

<GoalsCard {year} />

<div class="tiles">
  {#if type !== 'fic'}<StatTile label="Books finished" value={formatNumber(stats.finishedBooks)} />{/if}
  {#if type !== 'book'}<StatTile label="Fics finished" value={formatNumber(stats.finishedFics)} />{/if}
  <StatTile label="Words read" value={compact(stats.words)} sub={estimatedShare ? `≈ ${estimatedShare}% estimated` : ''} />
  {#if type !== 'book'}
    <StatTile
      label="Fics, in books"
      value="≈ {ficBooks >= 10 ? Math.round(ficBooks) : ficBooks.toFixed(1)}"
      sub="{compact(stats.ficWords)} fic words ÷ {compact(bookWords)} per {library.settings.bookEquivalentPages ?? 400}-page book"
    />
  {/if}
  {#if type !== 'fic'}<StatTile label="Pages read" value={compact(stats.pages)} />{/if}
  {#if stats.minutes}<StatTile label="Hours listened" value={formatNumber(Math.round(stats.minutes / 60))} />{/if}
  <StatTile label="Average rating" value={stats.avgRating ? stats.avgRating.toFixed(2) : '—'} sub={stats.avgRating ? 'of finished items' : ''} />
  {#if type !== 'fic' && stats.spent.purchases}
    <StatTile
      label="Spent"
      value={money(stats.spent.total)}
      sub={[
        stats.spent.purchases ? `${stats.spent.purchases} purchases` : '',
        stats.spent.unconverted ? `${spentOther} not converted` : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  {/if}
  <StatTile label="Did not finish" value={formatNumber(stats.dnf)} />
</div>

{#if stats.undatedFinished}
  <p class="small muted note">
    {stats.undatedFinished} finished reads have no date (for example from the Goodreads import), so they only count in
    All time. Add dates on each book’s page to place them.
  </p>
{/if}

<div class="charts">
  <section class="card"><ColumnChart title="Finished {perLabel}" {labels} series={finishedSeries} /></section>
  <section class="card">
    <ColumnChart
      title="Words read {perLabel}"
      caption="Counted on the days you logged progress; book words are estimated from pages when needed."
      {labels}
      series={[{ name: 'Words', color: 'var(--series-1)', values: stats.buckets.map((b) => b.words) }]}
      format={compact}
    />
  </section>
  {#if type !== 'fic'}
    <section class="card">
      <ColumnChart
        title="Pages read {perLabel}"
        {labels}
        series={[{ name: 'Pages', color: 'var(--series-1)', values: stats.buckets.map((b) => b.pages) }]}
        format={compact}
      />
    </section>
    {#if stats.spent.total > 0}
      <section class="card">
        <ColumnChart
          title="Spent {perLabel}"
          caption="In {currency}, at each purchase day’s exchange rate."
          {labels}
          series={[{ name: currency, color: 'var(--series-1)', values: stats.buckets.map((b) => b.spent) }]}
          format={(n) => formatMoney(n, currency)}
        />
      </section>
    {/if}
  {/if}
  <section class="card">
    <ColumnChart
      title="My ratings"
      caption="Finished items, by star rating."
      labels={stats.ratings.map((r) => (r.value % 1 ? `${Math.floor(r.value) || ''}½` : String(r.value)))}
      series={[{ name: 'Items', color: 'var(--series-1)', values: stats.ratings.map((r) => r.count) }]}
    />
  </section>
  {#if type !== 'fic' && stats.genres.length}
    <section class="card"><BarList title="Genres" rows={stats.genres} href={link('genres', 'genres')} /></section>
  {/if}
  {#if type !== 'book' && stats.fandoms.length}
    <section class="card"><BarList title="Fandoms" rows={stats.fandoms} href={link('fandoms')} /></section>
  {/if}
  <section class="card"><BarList title="Authors" rows={stats.authors} href={link('authors', 'authors')} /></section>
  <section class="card"><BarList title="Languages" rows={stats.languages} /></section>
  <section class="card"><BarList title="Formats" rows={stats.formats} /></section>
  {#if type !== 'fic' && stats.publishers.length}
    <section class="card"><BarList title="Publishers" rows={stats.publishers} href={link('publishers', 'publishers')} /></section>
  {/if}
  <section class="card facts">
    <h3>More</h3>
    <dl>
      <dt>Started</dt>
      <dd>{formatNumber(stats.started)}</dd>
      <dt>Added to library</dt>
      <dd>{formatNumber(stats.added)}</dd>
      {#if stats.avgDays}<dt>Average time to finish</dt><dd>{Math.round(stats.avgDays)} days</dd>{/if}
      {#if stats.longestBook}
        <dt>Longest book</dt>
        <dd><a href="#/item/{stats.longestBook.item.id}">{stats.longestBook.item.title}</a> · {formatNumber(stats.longestBook.pages)} pages</dd>
      {/if}
      {#if stats.shortestBook && stats.shortestBook.item !== stats.longestBook?.item}
        <dt>Shortest book</dt>
        <dd><a href="#/item/{stats.shortestBook.item.id}">{stats.shortestBook.item.title}</a> · {formatNumber(stats.shortestBook.pages)} pages</dd>
      {/if}
      {#if stats.longestFic}
        <dt>Longest fic</dt>
        <dd><a href="#/item/{stats.longestFic.item.id}">{stats.longestFic.item.title}</a> · {compact(stats.longestFic.words)} words</dd>
      {/if}
    </dl>
  </section>
</div>

<style>
  .head {
    justify-content: space-between;
    align-items: baseline;
  }

  .filters {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .presets {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .presets .chip {
    border: none;
    cursor: pointer;
    padding: 0.35em 0.85em;
  }

  .filters select {
    width: auto;
  }

  .period {
    margin: -0.4rem 0 1rem;
  }

  .custom {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .custom .field {
    width: 11rem;
  }

  .tiles {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 1rem 0;
  }

  @media (min-width: 700px) {
    .tiles {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .note {
    margin: -0.25rem 0 1rem;
  }

  .charts {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 900px) {
    .charts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .facts h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
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
