<script lang="ts">
  import type { ItemDraft } from '../lib/drafts';
  import { parseAmazonRef } from '../lib/import/amazon';
  import { parseIsbn } from '../lib/isbn';
  import { goodreadsSlugQuery, lookupIsbn, mergeDrafts, QuotaError, searchBooks } from '../lib/lookup';
  import { library } from '../lib/store.svelte';
  import { LANGUAGE_NAME } from '../lib/constants';
  import Icon from './Icon.svelte';
  import ScanDialog from './ScanDialog.svelte';

  // Finds book details by ISBN, Goodreads link, or title/author, and hands the
  // chosen result to the form.
  let { onpick, initial = '' }: { onpick: (draft: ItemDraft) => void; initial?: string } = $props();

  // svelte-ignore state_referenced_locally
  let query = $state(initial);
  let busy = $state(false);
  let message = $state('');
  let results = $state<ItemDraft[]>([]);
  let goodreadsUrl: string | undefined;
  let scanning = $state(false);
  const canScan = typeof navigator !== 'undefined' && !!navigator.mediaDevices;

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
      // Amazon link or ASIN: print editions carry the ISBN; Kindle ones only a title in the link.
      const amazon = parseAmazonRef(q);
      if (amazon) {
        if (amazon.isbn13) {
          const found = await lookupIsbn(amazon.isbn13, opts());
          onpick(found ?? { type: 'book', book: { isbn13: amazon.isbn13 } });
          message = found
            ? `Found by the ISBN in the Amazon link, from ${found.source}. Check the details below.`
            : 'The Amazon link has this book’s ISBN, but no book database knows it yet. The ISBN was filled in; for the rest use the Amazon bookmarklet (Import page).';
          return;
        }
        if (!amazon.query) {
          message = amazon.asin
            ? 'Kindle ASINs can’t be looked up outside Amazon. Paste the full Amazon link (it has the title in it), search by title, or use the Amazon bookmarklet on the book’s page (Import page).'
            : 'Short Amazon links (amzn.asia) can’t be read. Open it, then copy the full link from the address bar, or use the Amazon bookmarklet there (Import page).';
          return;
        }
        results = await searchBooks(amazon.query, opts());
        message = results.length
          ? `Amazon pages can’t be read directly, so these match the title in the link (“${amazon.query}”). For exact Kindle details, use the Amazon bookmarklet (Import page).`
          : `Nothing found for “${amazon.query}”. Use the Amazon bookmarklet on the book’s page (Import page), or search with fewer words.`;
        return;
      }
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
        placeholder="ISBN, Amazon or Goodreads link, ASIN, or title"
        autocomplete="off"
        enterkeyhint="search"
      />
    </label>
    <button class="btn" disabled={busy || !query.trim()}>
      <Icon name="search" size={18} />
      {busy ? 'Searching…' : 'Search'}
    </button>
    {#if canScan}
      <button type="button" class="btn" onclick={() => (scanning = true)} aria-label="Scan barcode">
        <Icon name="barcode" size={18} /><span class="scan-label">Scan</span>
      </button>
    {/if}
  </form>
  <ScanDialog
    open={scanning}
    onclose={() => (scanning = false)}
    onresult={(isbn) => {
      scanning = false;
      query = isbn;
      void search();
    }}
  />
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

  @media (max-width: 420px) {
    .scan-label {
      display: none;
    }
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
