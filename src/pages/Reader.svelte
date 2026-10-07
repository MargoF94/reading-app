<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import ReaderContents from '../components/reader/ReaderContents.svelte';
  import ReaderSettings from '../components/reader/ReaderSettings.svelte';
  import { getMeta, setMeta } from '../lib/db';
  import { deviceFiles } from '../lib/deviceFiles.svelte';
  import { formatBytes } from '../lib/itemFiles';
  import {
    cleanPrefs,
    DEFAULT_PREFS,
    percentOf,
    THEME_COLORS,
    type FromFrame,
    type ReaderPrefs,
    type SearchHit,
    type TocEntry,
    type ToFrame,
  } from '../lib/reader';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { debounce, nowIso } from '../lib/util';

  // Full-screen EPUB reader. The book itself is shown by reader-frame.html (locked
  // down so scripts inside books can't run); this page holds the controls, saves
  // where you are and turns page turns into reading progress.
  let { itemId, fileId }: { itemId: string; fileId: string } = $props();

  const PREFS_KEY = 'readerPrefs';
  const FRAME_URL = new URL('reader-frame.html', document.baseURI).href;

  const item = $derived(library.item(itemId));
  const stored = $derived(item?.files?.find((f) => f.id === fileId));

  let frame: HTMLIFrameElement | undefined = $state();
  let phase = $state<'loading' | 'downloading' | 'opening' | 'reading' | 'error'>('loading');
  let error = $state('');
  let prefs = $state<ReaderPrefs>({ ...DEFAULT_PREFS });
  let controls = $state(false);
  let sheet = $state<null | 'settings' | 'contents'>(null);
  let loc = $state<{ fraction: number; chapter?: string; chapterHref?: string; page?: number; pages?: number }>({ fraction: 0 });
  let toc = $state.raw<TocEntry[]>([]);
  let bookLang = $state('');
  let rtl = $state(false);
  let dragging = $state<number | null>(null); // slider value while it's being dragged
  let hits = $state.raw<SearchHit[]>([]);
  let searching = $state(false);
  let searched = $state('');

  let frameReady = false;
  let file: File | null = null;
  let sent = false;
  let pending: { cfi: string; fraction: number } | null = null;

  const colors = $derived(THEME_COLORS[prefs.theme]);
  const percent = $derived(percentOf(dragging ?? loc.fraction));
  const chapterIndex = $derived(toc.findIndex((t) => t.href === loc.chapterHref));

  const post = (m: ToFrame) => frame?.contentWindow?.postMessage(m, location.origin);

  function openWhenReady() {
    if (sent || !frameReady || !file) return;
    sent = true;
    phase = 'opening';
    post({ type: 'open', file, cfi: stored?.position?.cfi, prefs: $state.snapshot(prefs) });
  }

  // ---- saving where you are ----

  async function save() {
    const p = pending;
    if (!p) return;
    pending = null;
    await library.saveReaderPosition(itemId, fileId, { cfi: p.cfi, fraction: p.fraction, at: nowIso() });
    await library.logReaderProgress(itemId, percentOf(p.fraction));
  }
  const saveSoon = debounce(() => void save(), 2500);

  async function markStarted() {
    const it = library.item(itemId);
    if (it && library.status(itemId) === 'want-to-read') {
      await library.setStatus(it, 'currently-reading');
      toasts.show('Marked as Reading — started today.');
    }
  }

  // ---- messages from the frame ----

  function onMessage(e: MessageEvent<FromFrame>) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    switch (m.type) {
      case 'ready':
        frameReady = true;
        openWhenReady();
        break;
      case 'opened':
        toc = m.toc;
        bookLang = m.language ?? item?.language ?? '';
        rtl = m.rtl;
        phase = 'reading';
        void markStarted();
        break;
      case 'relocate':
        loc = { fraction: m.fraction, chapter: m.chapter, chapterHref: m.chapterHref, page: m.page, pages: m.pages };
        pending = { cfi: m.cfi, fraction: m.fraction };
        saveSoon();
        break;
      case 'tap':
        if (sheet) sheet = null;
        else controls = !controls;
        break;
      case 'key':
        if (m.key === 'Escape') escape();
        break;
      case 'search-hits':
        hits = [...hits, ...m.hits];
        break;
      case 'search-done':
        searching = false;
        break;
      case 'error':
        phase = 'error';
        error = `Couldn’t open this file: ${m.message}`;
        break;
    }
  }

  function escape() {
    if (sheet) sheet = null;
    else if (controls) controls = false;
    else void close();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') escape();
    else if (!sheet && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) post({ type: 'turn', dir: e.key === 'ArrowLeft' ? 'left' : 'right' });
    else return;
    e.preventDefault();
  }

  // ---- controls ----

  const savePrefs = debounce((p: ReaderPrefs) => void setMeta(PREFS_KEY, p), 400);
  function setPrefs(p: ReaderPrefs) {
    prefs = p;
    post({ type: 'prefs', prefs: $state.snapshot(prefs) });
    savePrefs($state.snapshot(prefs));
  }

  function go(target: string) {
    post({ type: 'goto', target });
    sheet = null;
    controls = false;
  }

  function search(query: string) {
    hits = [];
    searched = query;
    searching = true;
    post({ type: 'search', query });
  }

  function closeSheet() {
    sheet = null;
  }

  async function close() {
    await save();
    router.back(`/item/${itemId}`);
  }

  // ---- start ----

  onMount(() => {
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const themeColor = meta?.content;
    const flush = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);

    void (async () => {
      prefs = cleanPrefs(await getMeta(PREFS_KEY));
      if (!stored) {
        phase = 'error';
        error = 'This file isn’t in your library any more.';
        return;
      }
      await deviceFiles.load();
      phase = deviceFiles.has(stored) ? 'loading' : 'downloading';
      try {
        file = await deviceFiles.fetch(sync.config, stored);
      } catch (err) {
        phase = 'error';
        error = err instanceof Error ? err.message : String(err);
        return;
      }
      openWhenReady();
    })();

    return () => {
      html.style.overflow = overflow;
      if (meta && themeColor) meta.content = themeColor;
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      void save();
    };
  });

  // The phone's status bar matches the page colour.
  $effect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = colors.bg;
  });

  // Searches are cleared from the pages when the contents sheet closes.
  $effect(() => {
    if (sheet !== 'contents' && searched) {
      post({ type: 'clear-search' });
      searched = '';
      hits = [];
      searching = false;
    }
  });
</script>

<svelte:window onmessage={onMessage} onkeydown={onKey} />

<div
  class="reader"
  class:dark={colors.dark}
  style:--rbg={colors.bg}
  style:--rfg={colors.fg}
  role="application"
  aria-label="Reader: {item?.title ?? 'book'}"
>
  <iframe bind:this={frame} src={FRAME_URL} title={item?.title ?? 'Book'} class:hidden={phase !== 'reading'}></iframe>

  {#if phase !== 'reading'}
    <div class="state">
      {#if phase === 'error'}
        <p>{error}</p>
        <button type="button" class="btn" onclick={() => router.back(`/item/${itemId}`)}>Back to the book</button>
      {:else}
        <p class="muted" role="status">
          {phase === 'downloading' && stored ? `Downloading the book (${formatBytes(stored.size)})…` : 'Opening…'}
        </p>
        {#if phase === 'downloading'}<p class="small muted">It stays on this device afterwards, so it opens offline.</p>{/if}
        <button type="button" class="btn ghost" onclick={() => router.back(`/item/${itemId}`)}>Cancel</button>
      {/if}
    </div>
  {/if}

  {#if phase === 'reading' && !controls && !sheet}
    <div class="status-line" aria-hidden="true">
      <span class="ch">{loc.chapter ?? ''}{loc.pages ? ` · ${loc.page} / ${loc.pages}` : ''}</span>
      <span>{percent}%</span>
    </div>
  {/if}

  {#if controls || phase !== 'reading'}
    <header class="bar">
      <button type="button" class="btn ghost icon" aria-label="Close the book" onclick={close}><Icon name="back" size={22} /></button>
      <span class="title">{item?.title ?? ''}</span>
      {#if phase === 'reading'}
        <button type="button" class="btn ghost icon" aria-label="Contents and search" onclick={() => (sheet = 'contents')}>
          <Icon name="list" size={22} />
        </button>
        <button type="button" class="btn ghost icon aa" aria-label="Reading settings" onclick={() => (sheet = 'settings')}>Aa</button>
      {/if}
    </header>
  {/if}

  {#if controls && phase === 'reading' && !sheet}
    <footer class="bottom">
      <div class="row info small">
        <strong class="ch">{loc.chapter ?? item?.title ?? ''}</strong>
        {#if loc.pages}<span class="muted">page {loc.page} of {loc.pages} in chapter</span>{/if}
      </div>
      <input
        type="range"
        min="0"
        max="1000"
        value={Math.round((dragging ?? loc.fraction) * 1000)}
        dir={rtl ? 'rtl' : 'ltr'}
        aria-label="Position in the book"
        aria-valuetext="{percent}%"
        oninput={(e) => (dragging = Number(e.currentTarget.value) / 1000)}
        onchange={(e) => {
          post({ type: 'fraction', fraction: Number(e.currentTarget.value) / 1000 });
          dragging = null;
        }}
      />
      <div class="row nav small">
        <button type="button" class="btn ghost small" disabled={chapterIndex <= 0} onclick={() => go(toc[chapterIndex - 1].href)}>
          ‹ Previous chapter
        </button>
        <strong class="pct">{percent}%</strong>
        <button
          type="button"
          class="btn ghost small"
          disabled={chapterIndex < 0 || chapterIndex >= toc.length - 1}
          onclick={() => go(toc[chapterIndex + 1].href)}
        >
          Next chapter ›
        </button>
      </div>
    </footer>
  {/if}

  {#if sheet === 'settings'}
    <ReaderSettings {prefs} lang={bookLang} onchange={setPrefs} onclose={closeSheet} />
  {:else if sheet === 'contents'}
    <ReaderContents {toc} current={loc.chapterHref} {hits} {searching} {searched} ongo={go} onsearch={search} onclose={closeSheet} />
  {/if}
</div>

<style>
  .reader {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--rbg);
    color: var(--rfg);
  }

  iframe {
    position: absolute;
    left: 0;
    right: 0;
    top: env(safe-area-inset-top);
    bottom: env(safe-area-inset-bottom);
    width: 100%;
    height: calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    border: 0;
    background: var(--rbg);
  }

  iframe.hidden {
    visibility: hidden;
  }

  .state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 2rem;
    text-align: center;
    color: var(--rfg);
  }

  .state p {
    margin: 0;
    max-width: 30rem;
  }

  .status-line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom) + 0.7rem);
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0 1.4rem;
    font-size: 0.72rem;
    opacity: 0.6;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .ch {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar,
  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 2;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .bar {
    top: 0;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: calc(env(safe-area-inset-top) + 0.3rem) 0.4rem 0.3rem;
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-weight: 600;
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aa {
    font-family: var(--font-serif);
    font-size: 1.2rem;
    font-weight: 600;
    width: 2.5rem;
  }

  .bottom {
    bottom: 0;
    padding: 0.7rem 1.1rem calc(env(safe-area-inset-bottom) + 0.7rem);
    border-top: 1px solid var(--border);
  }

  .info {
    justify-content: space-between;
    gap: 0.8rem;
  }

  .info .muted {
    white-space: nowrap;
  }

  .bottom input {
    width: 100%;
    margin: 0.6rem 0 0.3rem;
    accent-color: var(--accent);
  }

  .nav {
    justify-content: space-between;
  }

  .pct {
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  @media (min-width: 900px) {
    .bottom {
      left: 50%;
      right: auto;
      width: 640px;
      translate: -50% 0;
      bottom: 1rem;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
  }
</style>
