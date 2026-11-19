<script lang="ts">
  import { untrack } from 'svelte';
  import { router } from '../../lib/router.svelte';
  import { releasesToday } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { sync } from '../../lib/sync.svelte';
  import type { Item } from '../../lib/types';
  import { today } from '../../lib/util';
  import Cover from '../Cover.svelte';

  // Opening the app on the day a book comes out: a popup says so, once per book on this
  // device. Coming back to the app counts as opening it, and so does the minute after,
  // while books saved on other devices come in. Opened in the reader, it waits until the
  // book is closed.
  const KEY = 'reading-app:release-day-shown';
  const WINDOW = 60_000;

  let books = $state<Item[]>([]);
  let dialog: HTMLDialogElement | undefined = $state();
  let lookUntil = 0;
  let waiting = false;
  const shownHere = new Set<string>(); // also kept here, in case storage is blocked

  /** Books already announced on this device (by key), with when; a week is kept. */
  function announced(): Record<string, number> {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      const cutoff = Date.now() - 7 * 86_400_000;
      return Object.fromEntries(Object.entries(data).filter(([, t]) => typeof t === 'number' && t > cutoff)) as Record<string, number>;
    } catch {
      return {};
    }
  }

  function opened() {
    lookUntil = Date.now() + WINDOW;
    check();
  }

  function check() {
    if (!waiting && Date.now() > lookUntil) return;
    if (!library.loaded || document.visibilityState !== 'visible') return;
    if (router.route.segments[0] === 'read') {
      waiting = true;
      return;
    }
    waiting = false;
    const shown = announced();
    const seen = new Set([...Object.keys(shown), ...shownHere]);
    const due = releasesToday(library.items, today(), seen, (i) => ['read', 'dnf'].includes(library.status(i.id)));
    if (!due.length) return;
    for (const r of due) {
      shown[r.key] = Date.now();
      shownHere.add(r.key);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(shown));
    } catch {
      /* storage blocked: it may show again next time */
    }
    // Already open: these join the books in it.
    books = [...books, ...due.map((r) => r.item)];
  }

  $effect(() => {
    if (library.loaded) untrack(opened);
  });
  $effect(() => {
    const onShow = () => document.visibilityState === 'visible' && opened();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  });
  // Closing the reader, and books coming in from other devices.
  $effect(() => {
    void router.route;
    void library.items;
    void sync.lastSyncedAt;
    untrack(check);
  });

  $effect(() => {
    if (!dialog) return;
    if (books.length && !dialog.open) dialog.showModal();
    if (!books.length && dialog.open) dialog.close();
  });

  const close = () => (books = []);

  function open(item: Item) {
    close();
    router.go(`/item/${item.id}`);
  }
</script>

<dialog bind:this={dialog} class="release-pop" aria-labelledby="release-pop-title" onclose={close} onclick={(e) => e.target === dialog && close()}>
  {#if books.length}
    <!-- The padding is in here, so a tap at the edge of the card isn't taken for a tap outside it. -->
    <div class="inner">
      <p class="eyebrow" id="release-pop-title">{books.length === 1 ? 'Out today' : `${books.length} books out today`}</p>
      <ul>
        {#each books as item (item.id)}
          <li>
            <button type="button" class="book" onclick={() => open(item)}>
              <Cover {item} width={books.length === 1 ? 84 : 52} />
              <span class="text">
                <strong>{item.title}</strong>
                {#if library.authorNames(item)}<span class="muted">{library.authorNames(item)}</span>{/if}
                <span class="see small">See the book →</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
      <div class="actions">
        <!-- A popup starts on its button (not on the first book, which would get an outline). -->
        <!-- svelte-ignore a11y_autofocus -->
        <button type="button" class="btn primary" autofocus onclick={close}>Got it</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .release-pop {
    width: min(360px, calc(100% - 2rem));
    max-height: calc(100% - 4rem);
    margin: auto;
    padding: 0;
    border: none;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.3);
  }

  .inner {
    padding: 1.1rem 1.1rem 1rem;
  }

  .release-pop::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .eyebrow {
    margin: 0 0 0.8rem;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .book {
    display: flex;
    gap: 0.9rem;
    align-items: center;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .text strong {
    font-family: var(--font-serif);
    font-size: 1.1rem;
    line-height: 1.25;
  }

  .see {
    color: var(--accent);
    margin-top: 0.2rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
