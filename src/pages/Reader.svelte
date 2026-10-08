<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import ReaderContents from '../components/reader/ReaderContents.svelte';
  import ReaderSettings from '../components/reader/ReaderSettings.svelte';
  import ReaderSheet from '../components/reader/ReaderSheet.svelte';
  import QuoteForm from '../components/quotes/QuoteForm.svelte';
  import WordForm from '../components/vocab/WordForm.svelte';
  import { getMeta, setMeta } from '../lib/db';
  import { deviceFiles } from '../lib/deviceFiles.svelte';
  import { formatBytes } from '../lib/itemFiles';
  import {
    cleanPrefs,
    DEFAULT_PREFS,
    FOOTER_ORDER,
    percentOf,
    quoteLocation,
    selectedWord,
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
  import { quoteText } from '../lib/quotes';
  import type { Quote, ReaderBookmark } from '../lib/types';
  import { debounce, newId, nowIso, today } from '../lib/util';
  import { formatDuration, timeLeft } from '../lib/readingTime';
  import type { ReadingTime } from '../lib/types';

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
  let contentsTab = $state<'chapters' | 'search'>('chapters');
  let sheet = $state<null | 'settings' | 'contents' | 'quote' | 'word' | 'edit-quote'>(null);
  // Text selected in the book, to save as a quote or look up as a word.
  let selection = $state<{ text: string; cfi?: string; sentence?: string } | null>(null);
  const word = $derived(selection ? selectedWord(selection.text) : undefined);
  // What the open quote or word sheet was started with (the selection may change meanwhile).
  let picked = $state<{ text: string; cfi?: string; sentence?: string; word?: string; location: string } | null>(null);

  function pick(kind: 'quote' | 'word') {
    if (!selection) return;
    picked = { ...selection, word, location: quoteLocation(loc.chapter, loc.fraction) };
    sheet = kind;
  }
  let loc = $state<{
    fraction: number;
    chapter?: string;
    chapterHref?: string;
    page?: number;
    pages?: number;
    pageCfi?: string;
    excerpt?: string;
    bookmark?: string;
    location?: { current: number; total: number };
  }>({ fraction: 0 });
  let lastCfi = '';
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

  // ---- bookmarks and saved quotes in this book ----

  const bookmarks = $derived(stored?.bookmarks ?? []);
  const bookQuotes = $derived(library.quotesFor(itemId).filter((q) => q.fileId === fileId && q.cfi));
  let shownQuote = $state<Quote | null>(null); // an underlined quote that was tapped
  let editingQuote = $state<Quote | null>(null);

  $effect(() => {
    if (phase !== 'reading') return;
    post({ type: 'bookmarks', cfis: bookmarks.map((b) => b.cfi) });
  });
  $effect(() => {
    if (phase !== 'reading') return;
    post({ type: 'annotations', cfis: bookQuotes.map((q) => q.cfi!) });
  });

  async function toggleBookmark() {
    const list = $state.snapshot(bookmarks) as ReaderBookmark[];
    if (loc.bookmark) {
      await library.updateFile(itemId, fileId, { bookmarks: list.filter((b) => b.cfi !== loc.bookmark) });
      toasts.show('Bookmark removed.');
    } else if (loc.pageCfi) {
      const b: ReaderBookmark = {
        id: newId(),
        cfi: loc.pageCfi,
        fraction: loc.fraction,
        chapter: loc.chapter,
        excerpt: loc.excerpt,
        at: nowIso(),
      };
      await library.updateFile(itemId, fileId, { bookmarks: [...list, b].sort((x, y) => x.fraction - y.fraction) });
      toasts.show('Page bookmarked.');
    }
  }

  async function removeBookmark(id: string) {
    const list = $state.snapshot(bookmarks) as ReaderBookmark[];
    await library.updateFile(itemId, fileId, { bookmarks: list.filter((b) => b.id !== id) });
  }

  async function copyQuote(q: Quote) {
    try {
      await navigator.clipboard.writeText(quoteText(q, item ? { title: item.title, by: library.authorNames(item) } : undefined));
      toasts.show('Quote copied.');
    } catch {
      toasts.show('Couldn’t copy.', 'error');
    }
  }

  async function removeQuote(q: Quote) {
    if (!confirm('Remove this quote?')) return;
    await library.deleteQuote(q);
    shownQuote = null;
  }

  const post = (m: ToFrame) => frame?.contentWindow?.postMessage(m, location.origin);

  function openWhenReady() {
    if (sent || !frameReady || !file) return;
    sent = true;
    phase = 'opening';
    // A link from a saved quote opens the book at the quote; otherwise where reading stopped.
    const at = router.route.query.get('at') ?? undefined;
    if (customFont) post({ type: 'font', file: customFont.blob });
    post({ type: 'open', file, cfi: at ?? stored?.position?.cfi, prefs: $state.snapshot(prefs) });
  }

  // ---- saving where you are ----

  // Opened from a saved quote: a look at that page, which doesn't move your place or progress.
  const visiting = !!router.route.query.get('at');

  async function save() {
    const p = pending;
    if (!p || visiting) return;
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

  // ---- time spent reading ----
  // Counted while the book is on screen and pages keep turning: a few minutes
  // without a page turn, tap or key press (or leaving the app) pauses it.

  const IDLE_MS = 3 * 60_000;
  const TICK_MS = 5000;
  let activeUntil = 0;
  let lastTick = Date.now();
  let session: ReadingTime | null = null;
  let savedSeconds = 0;

  let sinceActivity = 0; // seconds counted since the last page turn or tap
  const GRACE_S = 60; // after that, time only counts if reading carries on

  const activity = () => {
    activeUntil = Date.now() + IDLE_MS;
    sinceActivity = 0;
  };

  function tick() {
    const now = Date.now();
    const dt = Math.min(now - lastTick, TICK_MS * 2);
    lastTick = now;
    if (phase !== 'reading' || visiting || document.visibilityState !== 'visible') return;
    if (now > activeUntil) {
      // Gone idle: keep a minute for the last page, drop the rest of the wait.
      if (session && sinceActivity > GRACE_S) {
        session.seconds = Math.max(0, session.seconds - (sinceActivity - GRACE_S));
        sinceActivity = GRACE_S;
        void saveTime();
      }
      return;
    }
    const date = today();
    if (session && session.date !== date) endSession();
    session ??= {
      id: newId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      itemId,
      date,
      start: nowIso(),
      seconds: 0,
      source: 'reader',
      from: loc.fraction,
      to: loc.fraction,
    };
    session.seconds += dt / 1000;
    sinceActivity += dt / 1000;
    session.to = loc.fraction;
    if (session.seconds - savedSeconds >= 60) void saveTime();
  }

  async function saveTime() {
    const s = session;
    if (!s || (s.seconds < 30 && savedSeconds === 0) || s.seconds === savedSeconds) return;
    savedSeconds = s.seconds;
    await library.saveTime({ ...s, seconds: Math.round(s.seconds) });
  }

  /** Ends the session (a new one starts with the next page). */
  function endSession() {
    void saveTime();
    session = null;
    savedSeconds = 0;
  }

  const timeLogs = $derived(library.timeFor(itemId));
  const leftInBook = $derived(timeLeft(timeLogs, loc.fraction));
  const leftInChapter = $derived(
    chapterIndex >= 0 ? timeLeft(timeLogs, loc.fraction, toc[chapterIndex + 1]?.fraction ?? 1) : undefined,
  );

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
        activity();
        toc = m.toc;
        bookLang = m.language ?? item?.language ?? '';
        rtl = m.rtl;
        phase = 'reading';
        void markStarted();
        break;
      case 'relocate':
        // A jump (contents, slider, link) ends the session so it doesn't count as reading speed.
        if (session && Math.abs(m.fraction - (session.to ?? m.fraction)) > 0.05) endSession();
        activity();
        loc = {
          fraction: m.fraction,
          chapter: m.chapter,
          chapterHref: m.chapterHref,
          page: m.page,
          pages: m.pages,
          pageCfi: m.pageCfi,
          excerpt: m.excerpt,
          bookmark: m.bookmark,
          location: m.location,
        };
        lastCfi = m.cfi;
        pending = { cfi: m.cfi, fraction: m.fraction };
        saveSoon();
        break;
      case 'annotation':
        shownQuote = bookQuotes.find((q) => q.cfi === m.cfi) ?? null;
        controls = false;
        break;
      case 'tap':
        activity();
        if (shownQuote) shownQuote = null;
        else if (sheet) sheet = null;
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
      case 'selection':
        activity();
        selection = m.text ? { text: m.text, cfi: m.cfi, sentence: m.sentence } : null;
        if (selection) controls = false;
        break;
      case 'error':
        phase = 'error';
        error = `Couldn’t open this file: ${m.message}`;
        break;
    }
  }

  function escape() {
    if (shownQuote) shownQuote = null;
    else if (sheet) sheet = null;
    else if (selection) clearSelection();
    else if (controls) controls = false;
    else void close();
  }

  function onKey(e: KeyboardEvent) {
    activity();
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') escape();
    else if (!sheet && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) post({ type: 'turn', dir: e.key === 'ArrowLeft' ? 'left' : 'right' });
    else return;
    e.preventDefault();
  }

  // ---- Kindle-style corners: clock on top, a switchable reading-info line below ----

  let clockText = $state('');
  const tickClock = () =>
    (clockText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  tickClock();
  $effect(() => {
    const t = setInterval(tickClock, 15_000);
    return () => clearInterval(t);
  });

  const locationText = $derived(loc.location ? `Location ${loc.location.current.toLocaleString('en-US')} of ${loc.location.total.toLocaleString('en-US')}` : '');
  const footerText = $derived.by(() => {
    switch (prefs.footer) {
      case 'location':
        return locationText;
      case 'page':
        return loc.pages ? `Page ${loc.page} of ${loc.pages} in chapter` : '';
      case 'chapter-time':
        return leftInChapter !== undefined ? `${formatDuration(leftInChapter)} left in chapter` : 'Learning reading speed';
      case 'book-time':
        return leftInBook !== undefined ? `${formatDuration(leftInBook)} left in book` : 'Learning reading speed';
      default:
        return '';
    }
  });

  function cycleFooter() {
    const i = FOOTER_ORDER.indexOf(prefs.footer);
    setPrefs({ ...prefs, footer: FOOTER_ORDER[(i + 1) % FOOTER_ORDER.length] });
  }

  // "Back to …" after jumping (contents, slider, search, bookmarks), like a Kindle.
  let jumpBack = $state<{ cfi: string; label: string } | null>(null);
  function rememberJump() {
    if (!lastCfi) return;
    jumpBack = { cfi: lastCfi, label: loc.location ? loc.location.current.toLocaleString('en-US') : `${percent}%` };
  }
  function goBack() {
    if (!jumpBack) return;
    const back = jumpBack;
    rememberJump();
    post({ type: 'goto', target: back.cfi });
  }

  // A font file loaded on this device, used when the font is "Your font".
  const FONT_KEY = 'readerFont';
  let customFont = $state<{ name: string; blob: Blob } | null>(null);
  async function loadFontFile(file: File) {
    if (file.size > 15 * 1024 * 1024) return toasts.show('That font file is too large.', 'error');
    customFont = { name: file.name, blob: file };
    await setMeta(FONT_KEY, { name: file.name, blob: file });
    post({ type: 'font', file });
    setPrefs({ ...prefs, font: 'custom' });
  }
  async function removeFontFile() {
    customFont = null;
    await setMeta(FONT_KEY, null);
    post({ type: 'font', file: null });
    if (prefs.font === 'custom') setPrefs({ ...prefs, font: 'literata' });
  }

  // ---- controls ----

  const savePrefs = debounce((p: ReaderPrefs) => void setMeta(PREFS_KEY, p), 400);
  function setPrefs(p: ReaderPrefs) {
    prefs = p;
    post({ type: 'prefs', prefs: $state.snapshot(prefs) });
    savePrefs($state.snapshot(prefs));
  }

  function go(target: string) {
    rememberJump();
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

  // While a menu (or a tapped quote) is open the page is covered, so a tap on it closes
  // the menu and goes back to reading instead of turning the page. On a phone with the
  // keyboard up, the first tap only puts the keyboard away, so nothing typed is lost.
  let typing = false;
  function outsideDown(e: PointerEvent) {
    const el = document.activeElement;
    typing =
      e.pointerType === 'touch' &&
      (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|url|email|number|tel)$/.test(el.type)));
  }
  function outsideTap() {
    activity();
    if (typing) {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    shownQuote = null;
    sheet = null;
    controls = false;
  }

  function clearSelection() {
    selection = null;
    post({ type: 'deselect' });
  }

  function saved(what: string) {
    toasts.show(what);
    clearSelection();
  }

  async function close() {
    await save();
    router.back(`/item/${itemId}`);
  }

  /**
   * The colour iPhones use for the very top of the screen (status bar area). Different
   * iOS versions take it from the theme-color tag or from the page background, so both
   * follow the reader's theme. The tag is replaced, not edited: some versions only notice new tags.
   */
  function setTopColor(color: string) {
    const old = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    if (old) old.replaceWith(meta);
    else document.head.append(meta);
    if (color !== themeColorDefault) {
      document.documentElement.style.backgroundColor = color;
      document.body.style.backgroundColor = color;
    }
  }
  const themeColorDefault = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? '';

  // ---- start ----

  onMount(() => {
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const themeColor = meta?.content;
    // Page turns are saved on this device as you read, but only uploaded when you
    // close the book or leave the app (each upload sends the whole library).
    const releaseSync = sync.hold();
    const flush = () => {
      if (document.visibilityState === 'hidden') void Promise.all([save(), saveTime()]).finally(() => void sync.flush());
      else activity();
    };
    const timer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);

    void (async () => {
      prefs = cleanPrefs(await getMeta(PREFS_KEY));
      customFont = (await getMeta<{ name: string; blob: Blob } | null>(FONT_KEY)) ?? null;
      if (prefs.font === 'custom' && !customFont) prefs = { ...prefs, font: 'literata' };
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
      if (themeColor) setTopColor(themeColor);
      html.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      clearInterval(timer);
      tick();
      void Promise.all([saveTime(), save()]).finally(releaseSync);
    };
  });

  // The phone's status bar matches the page colour.
  $effect(() => {
    setTopColor(colors.bg);
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

  {#if sheet || shownQuote}
    <button type="button" class="scrim" tabindex="-1" aria-hidden="true" onpointerdown={outsideDown} onclick={outsideTap}></button>
  {/if}

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

  {#if shownQuote && !sheet}
    <div class="quote-pop" role="dialog" aria-label="Saved quote">
      <div class="row qp-head">
        <span class="small muted">Your quote{shownQuote.location ? ` · ${shownQuote.location}` : ''}</span>
        <button type="button" class="btn ghost icon small" aria-label="Close" onclick={() => (shownQuote = null)}><Icon name="close" size={16} /></button>
      </div>
      <blockquote>{shownQuote.text}</blockquote>
      {#if shownQuote.note}<p class="small muted qp-note">{shownQuote.note}</p>{/if}
      <div class="row qp-actions">
        <button
          type="button"
          class="btn small"
          onclick={() => {
            editingQuote = shownQuote;
            shownQuote = null;
            sheet = 'edit-quote';
          }}><Icon name="edit" size={15} /> Edit</button
        >
        <button type="button" class="btn small" onclick={() => copyQuote(shownQuote!)}><Icon name="copy" size={15} /> Copy</button>
        <button type="button" class="btn ghost small danger-text" onclick={() => removeQuote(shownQuote!)}>Remove</button>
      </div>
    </div>
  {/if}

  {#if phase === 'reading' && selection && !sheet}
    <div class="select-bar" role="toolbar" aria-label="Selected text">
      <button type="button" class="btn primary small" onclick={() => pick('quote')}><Icon name="quote" size={16} /> Save quote</button>
      {#if word}
        <button type="button" class="btn small" onclick={() => pick('word')}>
          <Icon name="words" size={16} /> <span class="word">Add to Words</span>
        </button>
      {/if}
      <button type="button" class="btn ghost icon small" aria-label="Clear selection" onclick={clearSelection}><Icon name="close" size={16} /></button>
    </div>
  {:else if phase === 'reading' && !controls && !sheet}
    <div class="clock" aria-hidden="true">{clockText}</div>
    <div class="status-line">
      <button type="button" class="corner" onclick={cycleFooter} aria-label="Reading info: {footerText || 'hidden'}. Tap to change.">
        {footerText || '\u00a0'}
      </button>
      <span class="right" aria-hidden="true">{percent}%</span>
    </div>
  {/if}

  {#if controls || phase !== 'reading'}
    <header class="bar">
      <div class="bar-row">
      <button type="button" class="btn ghost icon" aria-label="Close the book" onclick={close}><Icon name="back" size={22} /></button>
      {#if phase === 'reading'}
        <button type="button" class="btn ghost icon" aria-label="Contents" onclick={() => { contentsTab = 'chapters'; sheet = 'contents'; }}>
          <Icon name="list" size={22} />
        </button>
      {/if}
      <span class="spacer"></span>
      {#if phase === 'reading'}
        <button type="button" class="btn ghost icon" aria-label="Search in book" onclick={() => { contentsTab = 'search'; sheet = 'contents'; }}>
          <Icon name="search" size={22} />
        </button>
        <button
          type="button"
          class="btn ghost icon bm"
          class:on={!!loc.bookmark}
          aria-pressed={!!loc.bookmark}
          aria-label={loc.bookmark ? 'Remove bookmark' : 'Bookmark this page'}
          onclick={toggleBookmark}
        >
          <Icon name="bookmark" size={22} />
        </button>
        <button
          type="button"
          class="btn ghost icon aa"
          aria-label="Reading settings"
          aria-expanded={sheet === 'settings'}
          onclick={() => (sheet = sheet === 'settings' ? null : 'settings')}>Aa</button
        >
      {/if}
      </div>
      <div class="title">{item?.title ?? ''}</div>
    </header>
  {/if}

  {#if controls && phase === 'reading' && !sheet}
    <footer class="bottom">
      <div class="info small">
        <span>{[locationText, `${percent}%`].filter(Boolean).join(' · ')}</span>
        <span class="muted ch">{loc.chapter ?? ''}{leftInBook !== undefined ? ` · about ${formatDuration(leftInBook)} left` : ''}</span>
      </div>
      {#if jumpBack}
        <button type="button" class="back-to" onclick={goBack}>Back to {jumpBack.label}</button>
      {/if}
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
          rememberJump();
          post({ type: 'fraction', fraction: Number(e.currentTarget.value) / 1000 });
          dragging = null;
        }}
      />
      <div class="row nav small">
        <button type="button" class="btn ghost small" disabled={chapterIndex <= 0} onclick={() => go(toc[chapterIndex - 1].href)}>
          ‹ Previous chapter
        </button>
        <span class="mid"></span>
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
    <ReaderSettings
      {prefs}
      lang={bookLang}
      customFontName={customFont?.name}
      onfontfile={loadFontFile}
      onfontremove={removeFontFile}
      onchange={setPrefs}
      onclose={closeSheet}
    />
  {:else if sheet === 'quote' && item && picked}
    <ReaderSheet title="Save quote" onclose={closeSheet}>
      <QuoteForm
        {item}
        initial={{ text: picked.text, location: picked.location, fileId, cfi: picked.cfi }}
        onclose={closeSheet}
        onsaved={() => saved('Quote saved.')}
      />
    </ReaderSheet>
  {:else if sheet === 'word' && item && picked?.word}
    <ReaderSheet title="Add to Words" onclose={closeSheet}>
      <WordForm
        {item}
        initial={{ word: picked.word, note: picked.sentence, language: bookLang || undefined }}
        onclose={closeSheet}
        onsaved={(w) => saved(`“${w.word}” added to Words.`)}
      />
    </ReaderSheet>
  {:else if sheet === 'contents'}
    <ReaderContents
      initialTab={contentsTab}
      {toc}
      current={loc.chapterHref}
      {bookmarks}
      quotes={bookQuotes}
      {hits}
      {searching}
      {searched}
      ongo={go}
      onsearch={search}
      onremovebookmark={removeBookmark}
      onclose={closeSheet}
    />
  {:else if sheet === 'edit-quote' && item && editingQuote}
    <ReaderSheet title="Edit quote" onclose={closeSheet}>
      <QuoteForm {item} quote={editingQuote} onclose={closeSheet} onsaved={() => toasts.show('Quote saved.')} />
    </ReaderSheet>
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
    top: var(--sat);
    bottom: env(safe-area-inset-bottom);
    width: 100%;
    height: calc(100% - var(--sat) - env(safe-area-inset-bottom));
    border: 0;
    background: var(--rbg);
  }

  iframe.hidden {
    visibility: hidden;
  }

  /* Over the page while a menu is open (under the menus and the top bar), see-through so text changes show. */
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
    -webkit-tap-highlight-color: transparent;
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

  /* Kindle-style corners: small sans text in the page's own colour. */
  .clock {
    position: absolute;
    top: calc(var(--sat) + 0.75rem);
    left: 0;
    right: 0;
    text-align: center;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.72rem;
    opacity: 0.75;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .status-line {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(env(safe-area-inset-bottom) + 0.7rem);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0 1.4rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .status-line .corner {
    pointer-events: auto;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    padding: 0.3rem 0;
    opacity: 0.85;
    cursor: pointer;
    min-width: 6rem;
    text-align: left;
  }

  .status-line .right {
    opacity: 0.85;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .spacer {
    flex: 1;
  }

  .back-to {
    display: block;
    margin: 0.5rem auto 0;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    border-radius: 6px;
    padding: 0.3rem 0.8rem;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .bm.on :global(svg) {
    fill: currentColor;
  }

  .bm.on {
    color: var(--accent);
  }

  .quote-pop {
    position: absolute;
    left: 0.9rem;
    right: 0.9rem;
    bottom: calc(env(safe-area-inset-bottom) + 2.6rem);
    z-index: 2;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.6rem 0.8rem 0.7rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
    max-height: 50%;
    overflow-y: auto;
  }

  @media (min-width: 700px) {
    .quote-pop {
      left: 50%;
      right: auto;
      width: 460px;
      translate: -50% 0;
    }
  }

  .qp-head {
    justify-content: space-between;
  }

  .quote-pop blockquote {
    margin: 0.2rem 0 0;
    font-family: var(--font-serif);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .qp-note {
    margin: 0.4rem 0 0;
  }

  .qp-actions {
    gap: 0.4rem;
    margin-top: 0.6rem;
  }

  .danger-text {
    color: var(--danger);
  }

  .select-bar {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(env(safe-area-inset-bottom) + 0.6rem);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
  }

  .select-bar .btn {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
  }

  .select-bar .btn :global(svg) {
    flex-shrink: 0;
  }

  .select-bar .word {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .select-bar .icon {
    margin-left: auto;
    flex-shrink: 0;
  }

  @media (min-width: 700px) {
    .select-bar {
      left: 50%;
      right: auto;
      translate: -50% 0;
    }
  }

  .status-line .right {
    white-space: nowrap;
  }

  .mid {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
  }


  .ch {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Controls in the page's own colours, like a Kindle's. */
  .bar,
  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 2;
    background: var(--rbg);
    color: var(--rfg);
    --border: color-mix(in srgb, var(--rfg) 16%, transparent);
    --text: var(--rfg);
    --text-2: color-mix(in srgb, var(--rfg) 62%, var(--rbg));
    --surface-2: color-mix(in srgb, var(--rfg) 7%, var(--rbg));
    box-shadow: 0 1px 8px rgb(0 0 0 / 0.08);
  }

  .bar :global(.btn.ghost),
  .bottom :global(.btn.ghost) {
    color: var(--rfg);
  }

  .bar {
    top: 0;
    padding: calc(var(--sat) + 0.3rem) 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }

  /* The book's title under the buttons, as on a Kindle. */
  .title {
    text-align: center;
    font-family: 'Literata', var(--font-serif);
    font-size: 1.05rem;
    padding: 0.1rem 1rem 0;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .info .ch {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
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
