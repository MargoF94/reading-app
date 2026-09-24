<script lang="ts">
  import type { ItemDraft } from '../lib/drafts';
  import { parseIsbn } from '../lib/isbn';
  import { goodreadsSlugQuery, lookupIsbn, mergeDrafts, QuotaError, searchBooks } from '../lib/lookup';
  import { library } from '../lib/store.svelte';
  import { LANGUAGE_NAME } from '../lib/constants';
  import Icon from './Icon.svelte';

  // Finds book details by ISBN, Goodreads link, or title/author, and hands the
  // chosen result to the form.
  let { onpick, initial = '' }: { onpick: (draft: ItemDraft) => void; initial?: string } = $props();

  // svelte-ignore state_referenced_locally
  let query = $state(initial);
  let busy = $state(false);
  let message = $state('');
  let results = $state<ItemDraft[]>([]);
  let goodreadsUrl: string | undefined;

  const opts = () => ({ googleKey: library.settings.googleBooksKey });

  async function search(e?: Event) {
    e?.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    busy = true;
    message = '';
    results = [];
    goodreadsUrl = undefined;
    try {
      const isbn = parseIsbn(q);
      if (isbn) {
        const found = await lookupIsbn(isbn.isbn13, opts());
        if (found) {
          onpick(found);
          message = `Filled in from ${found.source}. Check the details below.`;
        } else {
          onpick({ type: 'book', book: isbn });
          message = 'No details found for this ISBN (common for Russian and some Japanese books). The ISBN was filled in; add the rest by hand.';
        }
        return;
      }
      let text = q;
      if (/goodreads\.com/i.test(q)) {
        const slug = goodreadsSlugQuery(q);
        if (!slug) {
          message = 'That Goodreads link has no title in it. Use the Goodreads bookmarklet (Import page) or search by title.';
          return;
        }
        goodreadsUrl = q.split(/[?#]/)[0];
        text = slug;
      }
      results = await searchBooks(text, opts());
      if (!results.length) message = 'Nothing found. Try fewer words, or the original-language title.';
    } catch (err) {
      message =
        err instanceof QuotaError
          ? 'Google Books’ free daily limit is used up. Add your own free key in Settings, or try again tomorrow.'
          : err instanceof Error
            ? err.message
            : String(err);
    } finally {
      busy = false;
    }
  }

  async function choose(candidate: ItemDraft) {
    busy = true;
    try {
      const isbn = candidate.book?.isbn13;
      const full = isbn ? await lookupIsbn(isbn, opts()).catch(() => undefined) : undefined;
      const merged = mergeDrafts([candidate, full]) ?? candidate;
      if (goodreadsUrl) merged.book = { ...merged.book, goodreadsUrl };
      if (full?.coverUrl) merged.coverUrl = full.coverUrl;
      onpick(merged);
      results = [];
      message = `Filled in from ${merged.source}. Check the details below.`;
    } finally {
      busy = false;
    }
  }
</script>

<div class="lookup card">
  <form class="row" onsubmit={search} role="search">
    <label class="grow">
      <span class="label">Find details online</span>
      <input
        bind:value={query}
        placeholder="ISBN, Goodreads link, or title and author"
        autocomplete="off"
        enterkeyhint="search"
      />
    </label>
    <button class="btn" disabled={busy || !query.trim()}>
      <Icon name="search" size={18} />
      {busy ? 'Searching…' : 'Search'}
    </button>
  </form>
  {#if message}<p class="small msg" role="status">{message}</p>{/if}
  {#if results.length}
    <ul class="results">
      {#each results as r, i (i)}
        <li>
          <button type="button" onclick={() => choose(r)} disabled={busy}>
            {#if r.coverUrl}
              <img src={r.coverUrl} alt="" loading="lazy" />
            {:else}
              <span class="noimg"><Icon name="book" size={18} /></span>
            {/if}
            <span class="info">
              <strong>{r.title}</strong>
              <span class="small">{r.authors?.join(', ')}</span>
              <span class="small muted">
                {[
                  r.book?.publicationDate?.slice(0, 4),
                  r.book?.publisher,
                  r.language ? LANGUAGE_NAME[r.language] : '',
                  r.book?.isbn13,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span class="small muted">{r.source}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lookup {
    padding: 0.8rem 1rem;
  }

  form {
    align-items: flex-end;
    flex-wrap: nowrap;
  }

  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3em;
  }

  .msg {
    margin: 0.6rem 0 0;
  }

  .results {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 420px;
    overflow-y: auto;
  }

  .results button {
    display: flex;
    gap: 0.75rem;
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: 0.4rem;
    color: inherit;
  }

  .results button:hover {
    background: var(--surface-2);
    border-color: var(--border);
  }

  img,
  .noimg {
    width: 42px;
    height: 63px;
    object-fit: cover;
    border-radius: 3px;
    flex-shrink: 0;
    background: var(--surface-2);
  }

  .noimg {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-2);
  }

  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
