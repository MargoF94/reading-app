<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './components/Icon.svelte';
  import SyncBadge from './components/SyncBadge.svelte';
  import { router } from './lib/router.svelte';
  import { library } from './lib/store.svelte';
  import { sync } from './lib/sync.svelte';
  import { toasts } from './lib/toast.svelte';
  import BrowseDetail from './pages/BrowseDetail.svelte';
  import BrowseIndex from './pages/BrowseIndex.svelte';
  import Home from './pages/Home.svelte';
  import ListPage from './pages/ListPage.svelte';
  import ListsPage from './pages/ListsPage.svelte';
  import WordsPage from './pages/WordsPage.svelte';
  import SearchPage from './pages/SearchPage.svelte';
  import CharacterPage from './pages/CharacterPage.svelte';
  import CharactersIndex from './pages/CharactersIndex.svelte';
  import TimerBar from './components/TimerBar.svelte';
  import { timer } from './lib/timer.svelte';
  import CalendarPage from './pages/CalendarPage.svelte';
  import ReminderBanner from './components/calendar/ReminderBanner.svelte';
  import Stats from './pages/Stats.svelte';
  import YearInBooks from './pages/YearInBooks.svelte';
  import { kindInfo, type BrowseKind } from './lib/browse';
  import GoodreadsUpdate from './pages/GoodreadsUpdate.svelte';
  import Import from './pages/Import.svelte';
  import ItemForm from './pages/ItemForm.svelte';
  import ItemPage from './pages/ItemPage.svelte';
  import Library from './pages/Library.svelte';
  import NotFound from './pages/NotFound.svelte';
  import Settings from './pages/Settings.svelte';

  let loadError = $state('');

  onMount(async () => {
    try {
      await library.load();
      await timer.load();
      await sync.init();
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // Theme: "system" follows the device; otherwise force light/dark.
  $effect(() => {
    const theme = library.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  // Reveal inline spoilers in reviews on tap / Enter.
  function revealSpoiler(e: Event) {
    const el = (e.target as HTMLElement).closest?.('.spoiler');
    if (!el) return;
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    el.classList.toggle('revealed');
  }

  const NAV = [
    { href: '#/', icon: 'home', label: 'Home', match: (s: string[]) => s.length === 0 },
    {
      href: '#/library',
      icon: 'library',
      label: 'Library',
      match: (s: string[]) => ['library', 'browse', 'lists', 'list', 'character'].includes(s[0]),
    },
    { href: '#/add', icon: 'plus', label: 'Add', match: (s: string[]) => s[0] === 'add' || s[0] === 'import' },
    { href: '#/calendar', icon: 'calendar', label: 'Calendar', match: (s: string[]) => s[0] === 'calendar' },
    { href: '#/words', icon: 'words', label: 'Words', match: (s: string[]) => s[0] === 'words' || s[0] === 'vocabulary' },
    { href: '#/stats', icon: 'chart', label: 'Stats', match: (s: string[]) => s[0] === 'stats' },
  ];
  // Phones show Settings as a gear in the top bar; the sidebar lists it.
  const SETTINGS = { href: '#/settings', icon: 'settings', label: 'Settings', match: (s: string[]) => s[0] === 'settings' };
  const SEARCH = { href: '#/search', icon: 'search', label: 'Search', match: (s: string[]) => s[0] === 'search' };
  const SIDE_NAV = [SEARCH, ...NAV, SETTINGS];

  const seg = $derived(router.route.segments);
</script>

<svelte:document onclick={revealSpoiler} onkeydown={revealSpoiler} />

<div class="shell">
  <nav class="side" aria-label="Main">
    <a class="brand" href="#/"><Icon name="book" size={22} /> Reading Log</a>
    {#each SIDE_NAV as n (n.href)}
      <a href={n.href} class:active={n.match(seg)} aria-current={n.match(seg) ? 'page' : undefined}>
        <Icon name={n.icon} />
        {n.label}
      </a>
    {/each}
    <div class="side-sync"><SyncBadge /></div>
  </nav>

  <main>
    <div class="topbar">
      <a
        class="gear search"
        href="#/search"
        class:active={SEARCH.match(seg)}
        aria-label="Search"
        aria-current={SEARCH.match(seg) ? 'page' : undefined}><Icon name="search" size={22} /></a
      >
      <SyncBadge />
      <a
        class="gear"
        href="#/settings"
        class:active={SETTINGS.match(seg)}
        aria-label="Settings"
        aria-current={SETTINGS.match(seg) ? 'page' : undefined}><Icon name="settings" size={22} /></a
      >
    </div>
    <ReminderBanner />
    {#if loadError}
      <div class="card">
        <h1>Couldn't open the library</h1>
        <p>{loadError}</p>
        <p class="muted small">Private browsing modes sometimes block storage. Try a normal window.</p>
      </div>
    {:else if !library.loaded}
      <p class="muted">Loading…</p>
    {:else if seg.length === 0}
      <Home />
    {:else if seg[0] === 'library'}
      <Library />
    {:else if seg[0] === 'add'}
      {#key router.route.query.get('draft') ?? router.route.query.get('type')}
        <ItemForm
          type={router.route.query.get('type') === 'fic' ? 'fic' : 'book'}
          draftId={router.route.query.get('draft') ?? undefined}
        />
      {/key}
    {:else if seg[0] === 'item' && seg[1] && seg[2] === 'edit'}
      {#key seg[1] + (router.route.query.get('draft') ?? '')}
        <ItemForm id={seg[1]} draftId={router.route.query.get('draft') ?? undefined} />
      {/key}
    {:else if seg[0] === 'item' && seg[1]}
      {#key seg[1]}<ItemPage id={seg[1]} />{/key}
    {:else if seg[0] === 'settings'}
      <Settings />
    {:else if seg[0] === 'import' && seg[1] === 'goodreads-update'}
      <GoodreadsUpdate />
    {:else if seg[0] === 'import'}
      <Import />
    {:else if seg[0] === 'character' && seg[1]}
      {#key seg[1]}<CharacterPage id={seg[1]} />{/key}
    {:else if seg[0] === 'character'}
      {#key router.route.query.get('tag')}<CharacterPage tag={router.route.query.get('tag') ?? ''} />{/key}
    {:else if seg[0] === 'browse' && seg[1] === 'characters' && seg[2] !== undefined}
      <!-- Old links to a character tag open the character's page. -->
      {#key seg[2]}<CharacterPage tag={seg[2]} />{/key}
    {:else if seg[0] === 'browse' && seg[1] === 'characters'}
      <CharactersIndex />
    {:else if seg[0] === 'browse' && kindInfo(seg[1]) && seg[2] !== undefined}
      {#key seg[1] + '/' + seg[2]}<BrowseDetail kind={seg[1] as BrowseKind} key={seg[2]} />{/key}
    {:else if seg[0] === 'browse' && kindInfo(seg[1])}
      {#key seg[1]}<BrowseIndex kind={seg[1] as BrowseKind} />{/key}
    {:else if seg[0] === 'search'}
      <SearchPage />
    {:else if seg[0] === 'calendar'}
      <CalendarPage />
    {:else if seg[0] === 'words' || seg[0] === 'vocabulary'}
      <WordsPage />
    {:else if seg[0] === 'lists'}
      <ListsPage />
    {:else if seg[0] === 'list' && seg[1]}
      {#key seg[1]}<ListPage id={seg[1]} />{/key}
    {:else if seg[0] === 'stats' && seg[1] === 'year'}
      {#key seg[2]}<YearInBooks year={Number(seg[2]) || new Date().getFullYear()} />{/key}
    {:else if seg[0] === 'stats'}
      <Stats />
    {:else if seg[0] === 'read' && seg[1] && seg[2]}
      <!-- The reader (and its EPUB code) loads only when a book is opened. -->
      {#await import('./pages/Reader.svelte') then { default: Reader }}
        {#key seg[1] + '/' + seg[2]}<Reader itemId={seg[1]} fileId={seg[2]} />{/key}
      {/await}
    {:else}
      <NotFound />
    {/if}
  </main>

  <nav class="tabs" aria-label="Main">
    {#each NAV as n (n.href)}
      <a href={n.href} class:active={n.match(seg)} aria-current={n.match(seg) ? 'page' : undefined}>
        <Icon name={n.icon} size={22} />
        <span>{n.label}</span>
      </a>
    {/each}
  </nav>
</div>

{#if seg[0] !== 'read'}<TimerBar />{/if}

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .shell {
    min-height: 100dvh;
  }

  main {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0.5rem 1rem calc(var(--nav-h) + 1.5rem + env(safe-area-inset-bottom));
  }

  .topbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.4rem;
    min-height: 32px;
  }

  .gear {
    display: inline-flex;
    padding: 0.3rem;
    border-radius: var(--radius-sm);
    color: var(--text-2);
  }

  .search {
    margin-right: auto;
  }

  .gear.active {
    color: var(--accent);
  }

  .side {
    display: none;
  }

  .tabs {
    position: fixed;
    z-index: 20;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tabs a {
    flex: 1;
    height: var(--nav-h);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.72rem;
    color: var(--text-2);
    text-decoration: none;
  }

  .tabs a.active {
    color: var(--accent);
    font-weight: 600;
  }

  @media (min-width: 900px) {
    .shell {
      display: grid;
      grid-template-columns: 220px 1fr;
    }

    .tabs,
    .topbar {
      display: none;
    }

    main {
      width: 100%;
      padding: 2rem 2rem 3rem;
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      position: sticky;
      top: 0;
      height: 100dvh;
      padding: 1.25rem 0.75rem;
      border-right: 1px solid var(--border);
      background: var(--surface);
    }

    .side a {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-sm);
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }

    .side a:hover {
      background: var(--surface-2);
    }

    .side a.active {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .side .brand {
      font-family: var(--font-serif);
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 1rem;
    }

    .side .brand:hover {
      background: none;
    }

    .side-sync {
      margin-top: auto;
    }
  }

  .toasts {
    position: fixed;
    z-index: 100;
    left: 50%;
    translate: -50% 0;
    bottom: calc(var(--nav-h) + 1rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(420px, calc(100% - 2rem));
    pointer-events: none;
  }

  .toast {
    background: var(--text);
    color: var(--bg);
    padding: 0.7rem 1rem;
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    font-size: 0.9rem;
  }

  .toast.error {
    background: var(--danger);
    color: #fff;
  }

  @media (min-width: 900px) {
    .toasts {
      bottom: 1.5rem;
    }
  }
</style>
