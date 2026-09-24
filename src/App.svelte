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
  import Stats from './pages/Stats.svelte';
  import YearInBooks from './pages/YearInBooks.svelte';
  import { kindInfo, type BrowseKind } from './lib/browse';
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
      match: (s: string[]) => ['library', 'browse', 'lists', 'list'].includes(s[0]),
    },
    { href: '#/add', icon: 'plus', label: 'Add', match: (s: string[]) => s[0] === 'add' || s[0] === 'import' },
    { href: '#/stats', icon: 'chart', label: 'Stats', match: (s: string[]) => s[0] === 'stats' },
    { href: '#/settings', icon: 'settings', label: 'Settings', match: (s: string[]) => s[0] === 'settings' },
  ];

  const seg = $derived(router.route.segments);
</script>

<svelte:document onclick={revealSpoiler} onkeydown={revealSpoiler} />

<div class="shell">
  <nav class="side" aria-label="Main">
    <a class="brand" href="#/"><Icon name="book" size={22} /> Reading Log</a>
    {#each NAV as n (n.href)}
      <a href={n.href} class:active={n.match(seg)} aria-current={n.match(seg) ? 'page' : undefined}>
        <Icon name={n.icon} />
        {n.label}
      </a>
    {/each}
    <div class="side-sync"><SyncBadge /></div>
  </nav>

  <main>
    <div class="topbar"><SyncBadge /></div>
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
    {:else if seg[0] === 'import'}
      <Import />
    {:else if seg[0] === 'browse' && kindInfo(seg[1]) && seg[2] !== undefined}
      {#key seg[1] + '/' + seg[2]}<BrowseDetail kind={seg[1] as BrowseKind} key={seg[2]} />{/key}
    {:else if seg[0] === 'browse' && kindInfo(seg[1])}
      {#key seg[1]}<BrowseIndex kind={seg[1] as BrowseKind} />{/key}
    {:else if seg[0] === 'lists'}
      <ListsPage />
    {:else if seg[0] === 'list' && seg[1]}
      {#key seg[1]}<ListPage id={seg[1]} />{/key}
    {:else if seg[0] === 'stats' && seg[1] === 'year'}
      {#key seg[2]}<YearInBooks year={Number(seg[2]) || new Date().getFullYear()} />{/key}
    {:else if seg[0] === 'stats'}
      <Stats />
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
    min-height: 32px;
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
