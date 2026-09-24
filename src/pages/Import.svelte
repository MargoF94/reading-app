<script lang="ts">
  import { onMount } from 'svelte';
  import GoodreadsImport from '../components/GoodreadsImport.svelte';
  import Icon from '../components/Icon.svelte';
  import { saveDraft, type ItemDraft } from '../lib/drafts';
  import {
    ao3Bookmarklet,
    decodePayload,
    draftFromHtmlFile,
    draftFromPayload,
    goodreadsBookmarklet,
  } from '../lib/import/payload';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';

  let pageError = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  const appUrl = location.origin + location.pathname;
  const bookmarklets = [
    { name: 'Reading Log ← AO3', href: ao3Bookmarklet(appUrl), where: 'on an AO3 fic page' },
    { name: 'Reading Log ← Goodreads', href: goodreadsBookmarklet(appUrl), where: 'on a Goodreads book page' },
  ];

  /** Opens the add form (or the existing item's edit form) pre-filled with the draft. */
  function open(draft: ItemDraft) {
    const existing =
      draft.type === 'fic'
        ? library.ficByWorkId(draft.fic?.workId)
        : library.bookByIds(draft.book?.goodreadsUrl, draft.book?.isbn13);
    const id = saveDraft(draft);
    if (existing) {
      toasts.show(`“${existing.title}” is already in your library — showing it with the new details.`);
      router.go(`/item/${existing.id}/edit?draft=${id}`, true);
    } else router.go(`/add?draft=${id}`, true);
  }

  // Data sent by a bookmarklet: #/import?d=…
  onMount(() => {
    const d = router.route.query.get('d');
    if (!d) return;
    try {
      open(draftFromPayload(decodePayload(d)));
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
      router.go('/import', true);
    }
  });

  async function readPage(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    pageError = '';
    try {
      open(draftFromHtmlFile(await file.text()));
    } catch (err) {
      pageError = err instanceof Error ? err.message : String(err);
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toasts.show('Copied. Now paste it as a bookmark’s address (see the steps below).');
    } catch {
      toasts.show('Couldn’t copy automatically on this device.', 'error');
    }
  }
</script>

<h1>Import</h1>

<div class="stack page">
  {#if pageError}<p class="error card" role="alert">{pageError}</p>{/if}

  <GoodreadsImport />

  <section class="card stack">
    <h2>A saved page</h2>
    <p class="small" style="margin:0">
      An AO3 fic (its page saved from the browser, or AO3’s <strong>Download → HTML</strong>) or a saved Goodreads book
      page. The details open in the add form so you can check them before saving. If it’s already in your library (for
      example a work-in-progress fic with new chapters), its details are updated instead.
    </p>
    <div>
      <button type="button" class="btn" onclick={() => fileInput?.click()}>
        <Icon name="upload" size={18} /> Choose .html file
      </button>
    </div>
    <input bind:this={fileInput} type="file" accept=".html,.htm,text/html" hidden onchange={readPage} />
  </section>

  <section class="card stack">
    <h2>One-click bookmarklets</h2>
    <p class="small" style="margin:0">
      A bookmarklet is a bookmark that runs a small script. Click it while you’re on a fic or book page and this app
      opens with everything filled in. It only reads the page you’re on and sends nothing anywhere else.
    </p>
    <div class="marklets">
      {#each bookmarklets as b (b.name)}
        <div class="marklet">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <a
            class="btn primary"
            href={b.href}
            onclick={(e) => {
              e.preventDefault();
              toasts.show('Drag this button to your bookmarks bar instead of clicking it.');
            }}
          >
            {b.name}
          </a>
          <span class="small muted">Use it {b.where}.</span>
          <button type="button" class="btn small" onclick={() => copy(b.href)}>Copy code</button>
        </div>
      {/each}
    </div>
    <details>
      <summary>How to install on a computer</summary>
      <ol class="small">
        <li>Show the bookmarks bar (Chrome/Edge: Ctrl+Shift+B, Mac: ⌘+Shift+B; Firefox: View → Toolbars).</li>
        <li>Drag a button above onto the bookmarks bar.</li>
        <li>Open a fic on AO3 (or a book on Goodreads) and click the bookmark.</li>
      </ol>
    </details>
    <details>
      <summary>How to install on a phone</summary>
      <ol class="small">
        <li>Tap <strong>Copy code</strong> above.</li>
        <li>Bookmark any page (e.g. this one), then edit that bookmark: name it “Reading Log AO3” and replace its address with the copied code.</li>
        <li>
          To use it: on iPhone/iPad open the bookmark from Safari’s bookmarks while on the fic page. On Android Chrome, type
          the bookmark’s name in the address bar and tap it in the suggestions.
        </li>
      </ol>
      <p class="small muted">If a bookmarklet stops working after an AO3 or Goodreads redesign, install it again from here.</p>
    </details>
  </section>
</div>

<style>
  .page {
    max-width: 760px;
  }

  h2 {
    margin: 0;
  }

  .marklets {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .marklet {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .marklet a {
    cursor: grab;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  ol {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
