<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import GoalsCard from '../components/GoalsCard.svelte';
  import ItemCard from '../components/ItemCard.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import ProgressDialog from '../components/ProgressDialog.svelte';
  import { activeReading, entryLabel, entryPercent, lastFinishDate, latestEntry, unreadChapters } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import { formatDate } from '../lib/util';

  const byStatus = (s: string) => library.items.filter((i) => library.status(i.id) === s);

  const reading = $derived(byStatus('currently-reading'));
  // Most recently active first: last progress update, else start date, else when added.
  const lastActivity = (item: Item) => {
    const r = activeReading(library.readings(item.id));
    return latestEntry(r)?.date ?? r?.startDate ?? item.createdAt.slice(0, 10);
  };
  const SHOWN = 6;
  const readingShown = $derived(
    [...reading].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))).slice(0, SHOWN),
  );
  const onHold = $derived(byStatus('on-hold'));
  // Unfinished fics you've paused until the author posts more.
  const waiting = $derived(
    onHold
      .filter((i) => i.fic && !i.fic.complete)
      .sort((a, b) => (b.fic?.updatedDate ?? '').localeCompare(a.fic?.updatedDate ?? '')),
  );
  const updated = $derived(
    [...reading, ...onHold]
      .map((item) => ({ item, n: unreadChapters(item, library.readings(item.id)) }))
      .filter((x) => x.n > 0),
  );
  const recent = $derived(
    library.items
      .filter((i) => library.status(i.id) === 'read')
      .map((i) => ({ item: i, date: lastFinishDate(library.readings(i.id)) ?? '' }))
      .filter((x) => x.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6),
  );
  const wantCount = $derived(byStatus('want-to-read').length);
  const year = new Date().getFullYear();
  const readThisYear = $derived(
    library.data.readings.filter(
      (r) => !r.deleted && r.outcome === 'finished' && r.finishDate?.startsWith(String(year)) && library.item(r.itemId),
    ),
  );
  const booksThisYear = $derived(readThisYear.filter((r) => library.item(r.itemId)?.type === 'book').length);
  const ficsThisYear = $derived(readThisYear.filter((r) => library.item(r.itemId)?.type === 'fic').length);

  let updating = $state<Item | null>(null);

  function progress(item: Item) {
    const e = latestEntry(activeReading(library.readings(item.id)));
    return { percent: entryPercent(item, e) ?? 0, label: e ? entryLabel(item, e) : 'Not started' };
  }
</script>

<h1>Home</h1>

{#if library.items.length === 0}
  <div class="card empty">
    <h2>Your library is empty</h2>
    <p>Add your first book or fic to get started.</p>
    <div class="row" style="justify-content:center">
      <a class="btn primary" href="#/add">Add a book</a>
      <a class="btn" href="#/add?type=fic">Add a fic</a>
    </div>
    <p class="small" style="margin-top:1.5rem">
      Using another device already? <a href="#/settings">Connect sync</a> to load your library.
    </p>
  </div>
{:else}
  <div class="stats">
    <div class="stat"><strong>{booksThisYear}</strong><span>books read in {year}</span></div>
    <div class="stat"><strong>{ficsThisYear}</strong><span>fics read in {year}</span></div>
    <a class="stat" href="#/library?status=want-to-read"><strong>{wantCount}</strong><span>want to read</span></a>
  </div>

  <div class="goals"><GoalsCard year={year} compact /></div>

  <section>
    <h2>Currently reading</h2>
    {#if reading.length === 0}
      <p class="muted">Nothing in progress. <a href="#/library?status=want-to-read">Pick something to read</a>.</p>
    {:else}
      <div class="current">
        {#each readingShown as item (item.id)}
          {@const p = progress(item)}
          <div class="card now">
            <a href="#/item/{item.id}" style="text-decoration:none"><Cover {item} width={72} /></a>
            <div class="now-info">
              <a class="title" href="#/item/{item.id}">{item.title}</a>
              <span class="small muted">{library.authorNames(item)}</span>
              <ProgressBar percent={p.percent} label={p.label} />
              <button type="button" class="btn small" onclick={() => (updating = item)}>Update progress</button>
            </div>
          </div>
        {/each}
      </div>
      {#if reading.length > SHOWN}
        <p><a href="#/library?status=currently-reading">See all {reading.length} books you’re reading</a></p>
      {/if}
    {/if}
  </section>

  {#if updated.length}
    <section>
      <h2>New chapters</h2>
      <ul class="updates">
        {#each updated as { item, n } (item.id)}
          <li>
            <a href="#/item/{item.id}">{item.title}</a>
            <span class="chip accent">+{n} {n === 1 ? 'chapter' : 'chapters'}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if waiting.length}
    <section>
      <h2>Waiting for updates</h2>
      <ul class="updates">
        {#each waiting as item (item.id)}
          <li>
            <a href="#/item/{item.id}">{item.title}</a>
            <span class="small muted">
              {item.fic?.chaptersAvailable ?? '?'}/{item.fic?.chaptersTotal ?? '?'} ch.{item.fic?.updatedDate
                ? ` · updated ${formatDate(item.fic.updatedDate)}`
                : ''}
            </span>
            {#if item.fic?.url}<a class="small" href={item.fic.url} target="_blank" rel="noopener noreferrer">Check AO3</a>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if onHold.length}
    <section>
      <h2>On hold</h2>
      <div class="grid">
        {#each onHold as item (item.id)}<ItemCard {item} />{/each}
      </div>
    </section>
  {/if}

  {#if recent.length}
    <section>
      <h2>Recently finished</h2>
      <div class="grid">
        {#each recent as { item, date } (item.id)}
          <div>
            <ItemCard {item} />
            <span class="small muted">{formatDate(date)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
{/if}

{#if updating}
  <ProgressDialog item={updating} open={!!updating} onclose={() => (updating = null)} />
{/if}

<style>
  section {
    margin-top: 1.75rem;
  }

  .goals {
    margin-top: 1rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }

  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
  }

  .stat strong {
    font-size: 1.6rem;
    font-family: var(--font-serif);
    line-height: 1.1;
  }

  .stat span {
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .current {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 700px) {
    .current {
      grid-template-columns: 1fr 1fr;
    }
  }

  .now {
    display: flex;
    gap: 0.9rem;
    align-items: flex-start;
  }

  .now-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .now-info .btn {
    align-self: flex-start;
    margin-top: 0.2rem;
  }

  .title {
    font-weight: 600;
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .updates {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .updates li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }

  @media (min-width: 700px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }
</style>
