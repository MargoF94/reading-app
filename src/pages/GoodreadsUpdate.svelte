<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import { parseGoodreadsPayload, type GoodreadsPayload } from '../lib/import/goodreads-page';
  import {
    fillFromDraft,
    GOODREADS_ORIGIN,
    goodreadsId,
    goodreadsUpdateBookmarklet,
    updateCandidates,
  } from '../lib/import/goodreads-update';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Item } from '../lib/types';
  import { plural, today } from '../lib/util';

  const PAUSE_MS = 1200; // between pages, to go easy on Goodreads
  const TIMEOUT_MS = 45_000;

  const appUrl = location.origin + location.pathname;
  const marklet = goodreadsUpdateBookmarklet(appUrl);

  let again = $state(false);
  let connected = $state(false);
  let running = $state(false);
  let stopping = false;
  let done = $state(0);
  let total = $state(0);
  let updated = $state(0);
  let unchanged = $state(0);
  let failures = $state<{ item: Item; error: string }[]>([]);
  let recent = $state<{ item: Item; changed: string[] }[]>([]);
  let notice = $state('');
  let finished = $state(false);
  let noAnswer = $state(false);

  const candidates = $derived(updateCandidates(library.items, again));
  const opener = window.opener as Window | null;

  // Replies from the Goodreads tab, by book id.
  const waiting = new Map<string, (m: { data?: GoodreadsPayload; error?: string }) => void>();

  function onMessage(e: MessageEvent) {
    if (e.origin !== GOODREADS_ORIGIN || !opener || e.source !== opener) return;
    const m = e.data ?? {};
    if (m.t === 'rl-ready') connected = true;
    if (m.t === 'rl-book' && typeof m.id === 'string') {
      waiting.get(m.id)?.(m);
      waiting.delete(m.id);
    }
  }

  onMount(() => {
    window.addEventListener('message', onMessage);
    // Say hello until the Goodreads tab answers (it may still be setting up).
    let tries = 0;
    const hello = setInterval(() => {
      if (connected || !opener || opener.closed) return clearInterval(hello);
      if (++tries > 20) {
        noAnswer = true;
        return clearInterval(hello);
      }
      opener.postMessage({ t: 'rl-hello' }, GOODREADS_ORIGIN);
    }, 1000);
    opener?.postMessage({ t: 'rl-hello' }, GOODREADS_ORIGIN);
    return () => {
      stopping = true;
      clearInterval(hello);
      window.removeEventListener('message', onMessage);
    };
  });

  function request(id: string): Promise<{ data?: GoodreadsPayload; error?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ error: 'No answer from the Goodreads tab.' });
      }, TIMEOUT_MS);
      waiting.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      opener!.postMessage({ t: 'rl-fetch', id }, GOODREADS_ORIGIN);
    });
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function start() {
    const queue = [...candidates];
    running = true;
    stopping = false;
    finished = false;
    notice = '';
    done = 0;
    total = queue.length;
    updated = unchanged = 0;
    failures = [];
    recent = [];
    let busy = 0; // Goodreads saying "slow down" in a row
    try {
      for (let i = 0; i < queue.length && !stopping; i++) {
        if (!opener || opener.closed) {
          notice = 'The Goodreads tab was closed. Click the bookmarklet on goodreads.com again to continue.';
          connected = false;
          break;
        }
        const item = library.item(queue[i].id) ?? queue[i];
        const reply = await request(goodreadsId(item)!);
        if (reply.error && /HTTP (429|503)/.test(reply.error)) {
          if (++busy >= 3) {
            notice = 'Goodreads asked to slow down. Wait a few minutes, then press Start again to continue where it stopped.';
            break;
          }
          await sleep(60_000); // back off, then retry the same book
          i--;
          continue;
        }
        busy = 0;
        if (reply.data) {
          try {
            const draft = parseGoodreadsPayload(reply.data);
            const result = await fillFromDraft(item, draft, (c, n) => library.ensureNamed(c, n), today());
            await library.put('items', [result.item]);
            if (result.changed.length) {
              updated++;
              recent = [{ item: result.item, changed: result.changed }, ...recent].slice(0, 8);
            } else unchanged++;
          } catch (err) {
            failures = [...failures, { item, error: err instanceof Error ? err.message : String(err) }];
          }
        } else {
          failures = [...failures, { item, error: reply.error ?? 'Unknown error' }];
        }
        done = i + 1;
        if (i < queue.length - 1 && !stopping) await sleep(PAUSE_MS);
      }
      finished = true;
      if (!notice && !stopping) toasts.show(`Updated ${plural(updated, 'book')} from Goodreads.`);
    } finally {
      running = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(marklet);
      toasts.show('Copied. Now paste it as a bookmark’s address.');
    } catch {
      toasts.show('Couldn’t copy automatically on this device.', 'error');
    }
  }
</script>

<a href="#/import" class="small">← Import</a>
<h1>Update books from Goodreads</h1>

<div class="stack page">
  <p style="margin:0">
    Fetches the Goodreads page of every book that has a Goodreads link (like the books from your Goodreads export) and
    fills in what’s missing — the same as clicking the Goodreads bookmarklet on each book’s page: cover, description,
    genres, pages, publisher, publication dates, series, ISBN and format. Details you’ve already filled in, your
    shelves, dates, ratings and reviews are never changed.
  </p>

  {#if connected}
    <section class="card stack" aria-live="polite">
      <p class="connected" style="margin:0"><Icon name="check" size={18} /> Connected to your Goodreads tab.</p>
      {#if running}
        <ProgressBar
          percent={total ? (done / total) * 100 : 0}
          label={`${done} of ${total} checked · ${updated} updated · ${failures.length} failed`}
        />
        <p class="small muted" style="margin:0">
          Keep this tab and the Goodreads tab open. Leaving this tab in front keeps it going at full speed.
        </p>
        <div><button type="button" class="btn" onclick={() => (stopping = true)}>Stop</button></div>
      {:else}
        {#if finished}
          <p style="margin:0" role="status">
            <strong>Checked {plural(done, 'book')}:</strong> {updated} updated, {unchanged} already complete{failures.length
              ? `, ${failures.length} failed`
              : ''}.
          </p>
        {/if}
        <p style="margin:0">
          {#if candidates.length}
            {plural(candidates.length, 'book')} to check. At about two seconds each, that takes around
            {Math.max(1, Math.round((candidates.length * 2) / 60))} min.
          {:else}
            Every book with a Goodreads link has already been updated.
          {/if}
        </p>
        <label class="small check">
          <input type="checkbox" bind:checked={again} /> Include books that were already updated before
        </label>
        <div>
          <button type="button" class="btn primary" disabled={!candidates.length} onclick={start}>
            <Icon name="download" size={18} /> Start
          </button>
        </div>
      {/if}
      {#if notice}<p class="error" role="alert" style="margin:0">{notice}</p>{/if}
    </section>

    {#if recent.length}
      <section class="card stack">
        <h2>Latest updates</h2>
        <ul class="plain small">
          {#each recent as r (r.item.id)}
            <li><a href="#/item/{r.item.id}">{r.item.title}</a> <span class="muted">— {r.changed.join(', ')}</span></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if failures.length}
      <section class="card stack">
        <h2>Couldn’t update</h2>
        <p class="small muted" style="margin:0">You can open these on Goodreads and use the regular bookmarklet.</p>
        <ul class="plain small">
          {#each failures as f (f.item.id)}
            <li>
              <a href="#/item/{f.item.id}">{f.item.title}</a>
              <span class="muted">— {f.error}</span>
              <a href={f.item.book?.goodreadsUrl} target="_blank" rel="noopener">Goodreads ↗</a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <section class="card stack">
      <h2>How it works</h2>
      <p style="margin:0">
        {plural(updateCandidates(library.items).length, 'book')} can be updated. Your browser only lets goodreads.com
        read Goodreads pages, so this runs through a bookmarklet:
      </p>
      <ol>
        <li>
          Add this bookmarklet (it’s different from the one-book Goodreads bookmarklet):
          <div class="marklet">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <a
              class="btn primary"
              href={marklet}
              onclick={(e) => {
                e.preventDefault();
                toasts.show('Drag this button to your bookmarks bar instead of clicking it.');
              }}>Reading Log ⇄ Goodreads library</a
            >
            <button type="button" class="btn small" onclick={copy}>Copy code</button>
          </div>
          <span class="small muted">
            On a computer, drag the button to the bookmarks bar. On a phone, copy the code and paste it as a bookmark’s
            address (see the steps on the Import page).
          </span>
        </li>
        <li>Open <a href="https://www.goodreads.com/" target="_blank" rel="noopener">goodreads.com</a> (any page).</li>
        <li>Click the bookmark. This page opens in a new tab, connected to Goodreads, with a Start button.</li>
      </ol>
      <p class="small muted" style="margin:0">
        It fetches one book page at a time, only from Goodreads, and sends the details straight to this app. You can stop
        at any time and pick up later — updated books are skipped next time.
      </p>
      {#if opener}
        <p class="small {noAnswer ? 'error' : 'muted'}" style="margin:0" role="status">
          {noAnswer
            ? 'The Goodreads tab didn’t answer. Go back to it, reload the page and click the bookmarklet again.'
            : 'Waiting for the Goodreads tab…'}
        </p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 760px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .connected {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--accent);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .marklet {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin: 0.4rem 0;
  }

  .marklet a {
    cursor: grab;
  }

  ol {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0;
  }

  .plain {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow-wrap: anywhere;
  }

  .error {
    color: var(--danger);
  }
</style>
