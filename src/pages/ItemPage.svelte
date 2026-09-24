<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import ProgressDialog from '../components/ProgressDialog.svelte';
  import ReadingHistory from '../components/ReadingHistory.svelte';
  import StarRating from '../components/StarRating.svelte';
  import StatusMenu from '../components/StatusMenu.svelte';
  import { AO3_RATINGS, CURRENCIES, FORMAT_LABEL, LANGUAGE_NAME, PURCHASE_SOURCES } from '../lib/constants';
  import { renderMarkdown } from '../lib/markdown';
  import { activeReading, entryLabel, entryPercent, formatMinutes, latestEntry } from '../lib/reading';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Currency } from '../lib/types';
  import { formatDate, formatMoney, formatNumber } from '../lib/util';

  let { id }: { id: string } = $props();

  const item = $derived(library.item(id));
  const status = $derived(library.status(id));
  const active = $derived(activeReading(library.readings(id)));
  const last = $derived(latestEntry(active));

  const descLong = $derived((item?.description?.length ?? 0) > 450);

  let showProgress = $state(false);
  let descOpen = $state(false);
  let spoilerShown = $state(false);

  async function rate(v: number | undefined) {
    if (item) await library.saveItem({ ...item, rating: v });
  }

  async function remove() {
    if (!item || !confirm(`Delete “${item.title}” and its reading history?`)) return;
    await library.deleteItem(item);
    toasts.show('Deleted.');
    router.go('/library', true);
  }

  const spent = $derived.by(() => {
    const totals = new Map<Currency, number>();
    for (const p of item?.book?.purchases ?? []) {
      if (p.price) totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.price);
    }
    return [...totals].map(([c, v]) => formatMoney(v, c)).join(' + ');
  });

  const details = $derived.by(() => {
    if (!item) return [];
    const rows: [string, string][] = [];
    const b = item.book;
    const f = item.fic;
    if (b?.format) rows.push(['Format', FORMAT_LABEL[b.format]]);
    if (b?.pageCount) rows.push(['Pages', formatNumber(b.pageCount)]);
    if (b?.durationMinutes) rows.push(['Length', formatMinutes(b.durationMinutes)]);
    if (b?.narrator) rows.push(['Narrator', b.narrator]);
    if (b?.publisherId) rows.push(['Publisher', library.name('publishers', b.publisherId)]);
    if (b?.publicationDate) rows.push(['Published', formatDate(b.publicationDate)]);
    if (b?.isbn13 || b?.isbn10) rows.push(['ISBN', [b.isbn13, b.isbn10].filter(Boolean).join(' / ')]);
    if (item.language) rows.push(['Language', LANGUAGE_NAME[item.language] ?? item.language]);
    if (item.originalLanguage && item.originalLanguage !== item.language)
      rows.push(['Original language', LANGUAGE_NAME[item.originalLanguage] ?? item.originalLanguage]);
    if (f) {
      if (f.rating) rows.push(['Content rating', AO3_RATINGS.find((r) => r.value === f.rating)?.label ?? '']);
      if (f.chaptersAvailable !== undefined || f.chaptersTotal !== undefined)
        rows.push(['Chapters', `${f.chaptersAvailable ?? '?'}/${f.chaptersTotal ?? '?'}`]);
      rows.push(['Status', f.complete ? 'Complete' : 'Work in progress']);
      if (f.publishedDate) rows.push(['Published', formatDate(f.publishedDate)]);
      if (f.updatedDate) rows.push(['Updated', formatDate(f.updatedDate)]);
      if (f.completedDate) rows.push(['Completed', formatDate(f.completedDate)]);
    }
    if (item.wordCount) rows.push(['Words', formatNumber(item.wordCount) + (item.wordCountEstimated ? ' (estimate)' : '')]);
    return rows;
  });

  const ficTagGroups = $derived(
    item?.fic
      ? ([
          ['Archive warnings', item.fic.warnings],
          ['Categories', item.fic.categories],
          ['Fandoms', item.fic.fandoms],
          ['Relationships', item.fic.relationships],
          ['Characters', item.fic.characters],
          ['Additional tags', item.fic.additionalTags],
        ] as [string, string[]][]).filter(([, v]) => v.length)
      : [],
  );
</script>

{#if !item}
  <div class="empty">
    <h1>Not found</h1>
    <p>This item was deleted or never existed. <a href="#/library">Back to library</a></p>
  </div>
{:else}
  <div class="top">
    <button type="button" class="btn ghost small" onclick={() => router.back('/library')}>
      <Icon name="back" size={18} /> Back
    </button>
    <div class="row">
      <a class="btn small" href="#/item/{item.id}/edit"><Icon name="edit" size={16} /> Edit</a>
      <button type="button" class="btn small danger" onclick={remove}><Icon name="trash" size={16} /> Delete</button>
    </div>
  </div>

  <div class="hero">
    <div class="cover-col"><Cover {item} width={180} /></div>
    <div class="main-col">
      <h1>{item.title}</h1>
      {#if item.originalTitle || item.titleReading}
        <p class="muted alt">{[item.originalTitle, item.titleReading].filter(Boolean).join(' · ')}</p>
      {/if}
      <p class="by">by {library.authorNames(item) || 'Unknown author'}</p>
      {#if item.seriesId}
        <p class="small muted">
          {library.name('series', item.seriesId)}{item.seriesNumber ? ` #${item.seriesNumber}` : ''}
        </p>
      {/if}

      <div class="actions">
        <StatusMenu {item} />
        {#if status === 'currently-reading' || status === 'on-hold'}
          <button type="button" class="btn" onclick={() => (showProgress = true)}>Update progress</button>
        {/if}
      </div>

      {#if status === 'currently-reading' || status === 'on-hold'}
        <div class="progress">
          <ProgressBar
            percent={entryPercent(item, last) ?? 0}
            label={last ? `${entryLabel(item, last)} · ${formatDate(last.date)}` : 'No progress yet'}
          />
        </div>
      {/if}

      <div class="rating">
        <span class="label">My rating</span>
        <StarRating value={item.rating} onchange={rate} size={28} />
      </div>

      {#if item.genreIds.length || item.tagIds.length}
        <div class="chips">
          {#each library.names('genres', item.genreIds) as g (g)}<span class="chip accent">{g}</span>{/each}
          {#each library.names('tags', item.tagIds) as t (t)}<span class="chip">#{t}</span>{/each}
        </div>
      {/if}

      {#if item.fic?.url}
        <p><a href={item.fic.url} target="_blank" rel="noopener noreferrer">Open on AO3 <Icon name="external" size={14} /></a></p>
      {/if}
      {#if item.book?.goodreadsUrl}
        <p><a href={item.book.goodreadsUrl} target="_blank" rel="noopener noreferrer">Open on Goodreads <Icon name="external" size={14} /></a></p>
      {/if}
    </div>
  </div>

  <div class="columns">
    <div class="stack">
      {#if item.description}
        <section>
          <h2>{item.type === 'fic' ? 'Summary' : 'Description'}</h2>
          <div class="desc prose" class:clamped={descLong && !descOpen}>
            {@html renderMarkdown(item.description)}
          </div>
          {#if descLong}
            <button type="button" class="btn ghost small" onclick={() => (descOpen = !descOpen)}>
              {descOpen ? 'Show less' : 'Show more'}
            </button>
          {/if}
        </section>
      {/if}

      <section>
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">My review</h2>
          <a class="btn ghost small" href="#/item/{item.id}/edit?focus=review">{item.review ? 'Edit' : 'Write a review'}</a>
        </div>
        {#if item.review}
          {#if item.reviewSpoiler && !spoilerShown}
            <div class="spoiler-cover card">
              <p>This review contains spoilers.</p>
              <button type="button" class="btn small" onclick={() => (spoilerShown = true)}>Show review</button>
            </div>
          {:else}
            <div class="prose review">{@html renderMarkdown(item.review)}</div>
          {/if}
        {:else}
          <p class="muted small">No review yet.</p>
        {/if}
      </section>

      <ReadingHistory {item} />

      {#if item.notes}
        <section>
          <h2>Notes</h2>
          <div class="prose">{@html renderMarkdown(item.notes)}</div>
        </section>
      {/if}
    </div>

    <aside class="stack">
      {#if details.length}
        <section class="card">
          <h2>Details</h2>
          <dl>
            {#each details as [k, v] (k)}
              <dt>{k}</dt>
              <dd>{v}</dd>
            {/each}
          </dl>
        </section>
      {/if}

      {#if ficTagGroups.length}
        <section class="card">
          <h2>Tags</h2>
          {#each ficTagGroups as [label, values] (label)}
            <div class="tag-group">
              <span class="label">{label}</span>
              <div class="chips">{#each values as v (v)}<span class="chip">{v}</span>{/each}</div>
            </div>
          {/each}
        </section>
      {/if}

      {#if item.book?.purchases.length}
        <section class="card">
          <h2>Purchases</h2>
          <ul class="purchases">
            {#each item.book.purchases as p (p.id)}
              <li>
                <strong>{p.price !== undefined ? formatMoney(p.price, p.currency) : PURCHASE_SOURCES.find((s) => s.value === p.source)?.label}</strong>
                <span class="small muted">
                  {[p.price !== undefined && p.source !== 'bought' ? PURCHASE_SOURCES.find((s) => s.value === p.source)?.label : '', p.store, formatDate(p.date)].filter(Boolean).join(' · ')}
                </span>
              </li>
            {/each}
          </ul>
          {#if spent && item.book.purchases.length > 1}<p class="small">Total: <strong>{spent}</strong></p>{/if}
        </section>
      {/if}
    </aside>
  </div>

  {#if showProgress}
    <ProgressDialog {item} open={showProgress} onclose={() => (showProgress = false)} />
  {/if}
{/if}

<style>
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    text-align: center;
  }

  .main-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    width: 100%;
  }

  .main-col h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .alt,
  .by {
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    margin: 0.6rem 0 0.3rem;
  }

  .progress {
    width: 100%;
    max-width: 360px;
  }

  .rating {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 0.3rem;
  }

  .main-col .chips {
    justify-content: center;
    margin-top: 0.4rem;
  }

  .main-col p {
    margin: 0.2rem 0;
  }

  @media (min-width: 700px) {
    .hero {
      flex-direction: row;
      align-items: flex-start;
      text-align: left;
      gap: 2rem;
    }

    .main-col,
    .rating {
      align-items: flex-start;
    }

    .actions,
    .main-col .chips {
      justify-content: flex-start;
    }
  }

  .columns {
    display: grid;
    gap: 1.5rem;
    margin-top: 2rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 900px) {
    .columns {
      grid-template-columns: 1fr 320px;
      align-items: start;
    }
  }

  .desc.clamped {
    max-height: 9.5em;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 60%, transparent);
  }

  .spoiler-cover {
    text-align: center;
  }

  .spoiler-cover p {
    margin: 0 0 0.5rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
  }

  dt {
    color: var(--text-2);
    font-size: 0.9rem;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .tag-group + .tag-group {
    margin-top: 0.75rem;
  }

  .tag-group .label {
    display: block;
    margin-bottom: 0.25rem;
  }

  .purchases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .purchases li {
    display: flex;
    flex-direction: column;
  }
</style>
