<script lang="ts">
  import { LANGUAGE_NAME, STATUSES } from '../lib/constants';
  import {
    guessShelfStatus,
    parseGoodreadsCsv,
    planGoodreadsImport,
    type GoodreadsParseResult,
    type ImportOptions,
  } from '../lib/import/goodreads-csv';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Status } from '../lib/types';
  import { nowIso, plural } from '../lib/util';
  import CoverFinder from './CoverFinder.svelte';
  import Icon from './Icon.svelte';

  let input: HTMLInputElement | undefined = $state();
  let parsed = $state<GoodreadsParseResult | null>(null);
  let fileName = $state('');
  let error = $state('');
  let shelfStatus = $state<Record<string, Status>>({});
  let shelvesAsTags = $state(true);
  let guessLanguage = $state(true);
  let additionalAuthors = $state(false);
  let importing = $state(false);
  let importedIds = $state<string[] | null>(null);

  const options = $derived<ImportOptions>({ shelfStatus, shelvesAsTags, guessLanguage, additionalAuthors });
  // Preview only; the real plan is rebuilt at import time against the current library.
  const preview = $derived(parsed ? planGoodreadsImport(parsed.books, library.data, options, nowIso()) : null);

  const languageCounts = $derived.by(() => {
    const m = new Map<string, number>();
    for (const b of preview?.records.items ?? []) if (b.language) m.set(b.language, (m.get(b.language) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  });
  const altNameCount = $derived(parsed?.books.filter((b) => b.authorAltName).length ?? 0);
  const coAuthorBooks = $derived(parsed?.books.filter((b) => b.additionalAuthors.length).length ?? 0);

  async function read(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    importedIds = null;
    try {
      const result = parseGoodreadsCsv(await file.text());
      if (!result.books.length) throw new Error('The file has no books in it.');
      parsed = result;
      fileName = file.name;
      shelfStatus = Object.fromEntries(result.exclusiveShelves.map((s) => [s.name, guessShelfStatus(s.name)]));
    } catch (err) {
      parsed = null;
      error = err instanceof Error ? err.message : String(err);
    } finally {
      if (input) input.value = '';
    }
  }

  async function run() {
    if (!parsed) return;
    importing = true;
    try {
      const plan = planGoodreadsImport(parsed.books, library.data, options, nowIso());
      await library.importRecords(plan.records);
      importedIds = plan.records.items.map((i) => i.id);
      toasts.show(`Imported ${plural(plan.added, 'book')}.`);
      parsed = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      importing = false;
    }
  }
</script>

<section class="card stack">
  <h2>Goodreads library</h2>
  {#if importedIds}
    <p style="margin:0">
      <strong>Done — {plural(importedIds.length, 'book')} added.</strong>
      <a href="#/library">Open your library</a>
    </p>
    <h3 style="margin:0.5rem 0 0">Covers</h3>
    <p class="small muted" style="margin:0">
      Goodreads exports don’t include covers, descriptions or genres.
      <a href="#/import/goodreads-update">Get them from Goodreads</a> for all these books, or just look up covers here:
    </p>
    <CoverFinder itemIds={importedIds} />
  {:else if !parsed}
    <p class="small" style="margin:0">
      On Goodreads (website, not the app): <strong>My Books → Import and export → Export library</strong>. When the
      file is ready, download it and choose it here. Nothing is changed until you confirm.
    </p>
    <div>
      <button type="button" class="btn primary" onclick={() => input?.click()}>
        <Icon name="upload" size={18} /> Choose Goodreads CSV
      </button>
    </div>
  {:else if preview}
    <p style="margin:0">
      <strong>{fileName}</strong>: {plural(parsed.books.length, 'book')}.
      {#if preview.duplicates.length}
        {plural(preview.duplicates.length, 'book is', 'books are')} already in your library and will be skipped.
      {/if}
    </p>

    <div>
      <span class="label">Shelves</span>
      <div class="shelves">
        {#each parsed.exclusiveShelves as s (s.name)}
          <div class="shelf">
            <span class="chip">{s.name} <span class="muted">{s.count}</span></span>
            <span class="arrow" aria-hidden="true">→</span>
            <select bind:value={shelfStatus[s.name]} aria-label="Status for shelf {s.name}">
              {#each STATUSES as st (st.value)}<option value={st.value}>{st.label}</option>{/each}
            </select>
          </div>
        {/each}
      </div>
    </div>

    {#if parsed.tagShelves.length}
      <label class="check">
        <input type="checkbox" bind:checked={shelvesAsTags} />
        Import your other shelves as tags:
      </label>
      <div class="chips">
        {#each parsed.tagShelves as s (s.name)}<span class="chip">#{s.name} <span class="muted">{s.count}</span></span>{/each}
      </div>
    {/if}

    <label class="check">
      <input type="checkbox" bind:checked={guessLanguage} />
      Guess each book’s language from its title (Japanese or Cyrillic script, otherwise English)
    </label>
    {#if guessLanguage && languageCounts.length}
      <p class="small muted indent">
        {languageCounts.map(([code, n]) => `${LANGUAGE_NAME[code] ?? code}: ${n}`).join(' · ')}
      </p>
    {/if}

    {#if coAuthorBooks}
      <label class="check">
        <input type="checkbox" bind:checked={additionalAuthors} />
        Add “additional authors” as co-authors ({plural(coAuthorBooks, 'book')}; these are often translators, illustrators
        or narrators)
      </label>
    {/if}
    {#if altNameCount}
      <p class="small muted" style="margin:0">
        Author names written in another script (e.g. Hideyuki Kikuchi / 菊地秀行) are kept as the author’s other name, so
        search finds both. You can check them in Settings → Authors.
      </p>
    {/if}

    <p class="small muted" style="margin:0">
      Goodreads only exports the latest read date, so earlier re-reads are added without dates. Ratings, shelves, reviews
      and private notes come along.
    </p>

    <div class="row">
      <button type="button" class="btn primary" disabled={importing || !preview.added} onclick={run}>
        {importing ? 'Importing…' : `Import ${plural(preview.added, 'book')}`}
      </button>
      <button type="button" class="btn" disabled={importing} onclick={() => (parsed = null)}>Cancel</button>
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <input bind:this={input} type="file" accept=".csv,text/csv" hidden onchange={read} />
</section>

<style>
  h2 {
    margin: 0;
  }

  .shelves {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.4rem;
    max-width: 30rem;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .shelf .chip {
    align-self: flex-start;
    white-space: nowrap;
  }

  .shelf .arrow {
    display: none;
  }

  @media (min-width: 480px) {
    .shelf {
      flex-direction: row;
      align-items: center;
      gap: 0.6rem;
    }

    .shelf .chip {
      align-self: center;
      min-width: 11rem;
    }

    .shelf .arrow {
      display: inline;
    }

    .shelf select {
      flex: 1;
    }
  }

  .indent {
    margin: -0.6rem 0 0 1.6rem;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
