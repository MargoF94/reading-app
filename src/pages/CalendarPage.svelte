<script lang="ts">
  import EventCover, { EVENT_KINDS, type EventKind } from '../components/calendar/EventCover.svelte';
  import HistoryRow from '../components/calendar/HistoryRow.svelte';
  import ReleaseRow from '../components/calendar/ReleaseRow.svelte';
  import ScheduleDialog from '../components/calendar/ScheduleDialog.svelte';
  import SessionRow from '../components/calendar/SessionRow.svelte';
  import Icon from '../components/Icon.svelte';
  import { router } from '../lib/router.svelte';
  import {
    addDays,
    addMonths,
    historyEvents,
    monthGrid,
    monthReleases,
    occurrences,
    releases,
    startOfWeek,
    type HistoryEvent,
    type Occurrence,
    type Release,
  } from '../lib/schedule';
  import { library } from '../lib/store.svelte';
  import type { Item, ReadingSession } from '../lib/types';
  import { today } from '../lib/util';

  // Reading calendar: planned reading (green) and books coming out (gray).
  type View = 'month' | 'week' | 'list';
  const VIEWS: [View, string][] = [
    ['month', 'Month'],
    ['week', 'Week'],
    ['list', 'List'],
  ];
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const now = today();
  const view = $derived<View>((['week', 'list'] as const).find((v) => v === router.route.query.get('view')) ?? 'month');
  const selected = $derived(/^\d{4}-\d{2}-\d{2}$/.test(router.route.query.get('d') ?? '') ? router.route.query.get('d')! : now);
  const month = $derived(selected.slice(0, 7));

  // Date range on screen.
  const weeks = $derived(monthGrid(month));
  const range = $derived.by<[string, string]>(() => {
    if (view === 'month') return [weeks[0][0], weeks.at(-1)![6]];
    if (view === 'week') return [startOfWeek(selected), addDays(startOfWeek(selected), 6)];
    return [now, addDays(now, 59)];
  });

  // Kinds hidden with the legend toggles (remembered on this device).
  const HIDDEN_KEY = 'reading-app:calendar-hidden';
  let hidden = $state<Set<EventKind>>(loadHidden());
  function loadHidden(): Set<EventKind> {
    try {
      return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
  function toggle(kind: EventKind) {
    const next = new Set(hidden);
    if (!next.delete(kind)) next.add(kind);
    hidden = next;
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      /* not remembered */
    }
  }

  const occs = $derived(occurrences(library.schedule, range[0], range[1]));
  const rels = $derived(releases(library.items, range[0], range[1]));
  const history = $derived(historyEvents(library.items, library.data.readings, range[0], range[1]));

  type Entry =
    | { kind: 'scheduled'; occ: Occurrence; item: Item }
    | { kind: 'upcoming'; rel: Release; item: Item }
    | { kind: HistoryEvent['kind']; ev: HistoryEvent; item: Item };
  // Within a day: what happened first, then planned reading, then releases.
  const RANK: Record<EventKind, number> = { finished: 0, dnf: 1, started: 2, bought: 3, scheduled: 4, upcoming: 5 };
  const byDate = $derived.by(() => {
    const map = new Map<string, Entry[]>();
    const add = (d: string, e: Entry) => !hidden.has(e.kind) && (map.get(d) ?? map.set(d, []).get(d)!).push(e);
    for (const ev of history) add(ev.date, { kind: ev.kind, ev, item: ev.item });
    for (const occ of occs) {
      const item = library.item(occ.session.itemId);
      if (item) add(occ.date, { kind: 'scheduled', occ, item });
    }
    for (const rel of rels) add(rel.date, { kind: 'upcoming', rel, item: rel.item });
    for (const list of map.values()) list.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    return map;
  });
  const entryKey = (e: Entry) =>
    e.kind === 'scheduled' ? e.occ.key : e.kind === 'upcoming' ? `rel-${e.item.id}` : `${e.kind}-${e.ev.reading?.id ?? e.ev.purchase?.id}-${e.item.id}`;

  const laterReleases = $derived.by(() => {
    const months = view === 'list' ? [0, 1, 2].map((n) => addMonths(now.slice(0, 7), n)) : [month];
    return months.flatMap((m) => monthReleases(library.items, m));
  });

  const title = $derived.by(() => {
    if (view === 'month') return new Date(`${month}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'week') {
      const [a, b] = range;
      const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${f(a)} – ${f(b)}`;
    }
    return 'Coming up';
  });

  function go(params: { view?: View; d?: string }) {
    router.setQuery({ view: (params.view ?? view) === 'month' ? undefined : (params.view ?? view), d: params.d ?? router.route.query.get('d') ?? undefined });
  }

  function step(n: number) {
    if (view === 'month') {
      const m = addMonths(month, n);
      go({ d: m === now.slice(0, 7) ? now : `${m}-01` });
    } else go({ d: addDays(selected, 7 * n) });
  }

  const dayTitle = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Scheduling dialog.
  let dialog = $state<{ open: boolean; session?: ReadingSession; date?: string }>({ open: false });
  const openNew = (date?: string) => (dialog = { open: true, date: date ?? (selected >= now ? selected : now) });
  const openEdit = (session: ReadingSession) => (dialog = { open: true, session });
</script>

<div class="row head">
  <h1>Calendar</h1>
  <button type="button" class="btn primary" onclick={() => openNew()}><Icon name="plus" size={18} /> Schedule</button>
</div>

<div class="controls">
  <div class="row nav">
    {#if view !== 'list'}
      <button type="button" class="btn ghost icon" aria-label="Previous {view}" onclick={() => step(-1)}><Icon name="back" /></button>
    {/if}
    <h2 aria-live="polite">{title}</h2>
    {#if view !== 'list'}
      <button type="button" class="btn ghost icon flip" aria-label="Next {view}" onclick={() => step(1)}><Icon name="back" /></button>
    {/if}
    {#if selected !== now && view !== 'list'}
      <button type="button" class="btn small" onclick={() => go({ d: now })}>Today</button>
    {/if}
  </div>
  <div class="seg" role="tablist" aria-label="Calendar view">
    {#each VIEWS as [v, label] (v)}
      <button type="button" role="tab" aria-selected={view === v} class:on={view === v} onclick={() => go({ view: v })}>{label}</button>
    {/each}
  </div>
</div>

{#snippet entryRow(e: Entry, showDate = false)}
  {#if e.kind === 'scheduled'}
    <SessionRow occ={e.occ} {showDate} onedit={() => openEdit(e.occ.session)} />
  {:else if e.kind === 'upcoming'}
    <ReleaseRow release={e.rel} {showDate} />
  {:else}
    <HistoryRow event={e.ev} {showDate} />
  {/if}
{/snippet}

{#snippet legend()}
  <div class="legend" role="group" aria-label="Show on the calendar">
    {#each EVENT_KINDS as k (k.kind)}
      <button type="button" class="key" class:off={hidden.has(k.kind)} aria-pressed={!hidden.has(k.kind)} onclick={() => toggle(k.kind)}>
        <span class="ring sw {k.kind}"><span class="ev-badge"><Icon name={k.icon} size={10} /></span></span>
        {k.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet later()}
  {#if laterReleases.length}
    <section class="later">
      <h3 class="small muted">Coming out some time {view === 'list' ? 'soon' : 'this month'} (exact day unknown)</h3>
      <div class="later-list">
        {#each laterReleases as r (r.item.id)}<ReleaseRow release={r} coverWidth={36} />{/each}
      </div>
    </section>
  {/if}
{/snippet}

{#if view === 'month'}
  <div class="grid" role="grid" aria-label={title}>
    <div class="dow-row" role="row">
      {#each DOW as d (d)}<div class="dow" role="columnheader">{d}</div>{/each}
    </div>
    {#each weeks as week (week[0])}
      <div class="week-row" role="row">
        {#each week as d (d)}
          {@const entries = byDate.get(d) ?? []}
          {@const first = entries[0]}
          <button
            type="button"
            role="gridcell"
            class="day"
            class:other={d.slice(0, 7) !== month}
            class:today={d === now}
            class:sel={d === selected}
            aria-selected={d === selected}
            aria-label="{dayTitle(d)}{entries.length ? `, ${entries.length} planned` : ''}"
            onclick={() => go({ d })}
          >
            <span class="n">{+d.slice(8)}</span>
            {#if first}<EventCover item={first.item} kind={first.kind} width={26} />{/if}
            {#if entries.length > 1}
              <span class="dots" aria-hidden="true">
                {#each entries.slice(1, 4) as e, i (i)}<i class="dot {e.kind}"></i>{/each}
                {#if entries.length > 4}<span class="more">+{entries.length - 4}</span>{/if}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
  {@render legend()}

  <section class="card agenda">
    <div class="row agenda-head">
      <h3>{dayTitle(selected)}</h3>
      {#if selected >= now}
        <button type="button" class="btn small" onclick={() => openNew(selected)}><Icon name="plus" size={16} /> Add</button>
      {/if}
    </div>
    {#each byDate.get(selected) ?? [] as e (entryKey(e))}
      {@render entryRow(e)}
    {:else}
      <p class="small muted" style="margin:0.3rem 0 0">Nothing planned.</p>
    {/each}
  </section>
  {@render later()}
{:else if view === 'week'}
  {@render legend()}
  <div class="week-list">
    {#each Array.from({ length: 7 }, (_, i) => addDays(range[0], i)) as d (d)}
      {@const entries = byDate.get(d) ?? []}
      <section class="card week-day" class:today={d === now}>
        <div class="row agenda-head">
          <h3>{dayTitle(d)}{d === now ? ' · Today' : ''}</h3>
          {#if d >= now}
            <button type="button" class="btn ghost icon small" aria-label="Schedule reading on {dayTitle(d)}" onclick={() => openNew(d)}>
              <Icon name="plus" size={16} />
            </button>
          {/if}
        </div>
        {#each entries as e (entryKey(e))}
          {@render entryRow(e)}
        {:else}
          <p class="small muted" style="margin:0">Nothing planned.</p>
        {/each}
      </section>
    {/each}
  </div>
{:else}
  {@render legend()}
  {@const days = [...byDate.keys()].sort()}
  {#if days.length === 0 && laterReleases.length === 0}
    <div class="empty">
      <p>Nothing planned for the next two months.</p>
      <button type="button" class="btn primary" onclick={() => openNew()}>Schedule reading</button>
    </div>
  {:else}
    <div class="week-list">
      {#each days as d (d)}
        <section class="card week-day" class:today={d === now}>
          <h3>{dayTitle(d)}{d === now ? ' · Today' : ''}</h3>
          {#each byDate.get(d) ?? [] as e (entryKey(e))}
            {@render entryRow(e)}
          {/each}
        </section>
      {/each}
    </div>
  {/if}
  {@render later()}
{/if}

<ScheduleDialog open={dialog.open} session={dialog.session} date={dialog.date} onclose={() => (dialog = { open: false })} />

<style>
  .head {
    justify-content: space-between;
    align-items: center;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0.25rem 0 0.6rem;
  }

  .nav {
    gap: 0.15rem;
  }

  .nav h2 {
    margin: 0 0.2rem;
    font-family: var(--font-serif);
    font-size: 1.2rem;
    min-width: 0;
  }

  .flip :global(svg) {
    transform: scaleX(-1);
  }

  .seg {
    display: flex;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .seg button {
    border: none;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    padding: 0.3em 0.8em;
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
  }

  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow);
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .dow-row,
  .week-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 3px;
  }

  .dow {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-2);
    text-align: center;
    padding: 0.2rem 0;
  }

  .day {
    min-height: 84px;
    padding: 3px 0 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--surface);
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    min-width: 0;
  }

  .day.other {
    background: transparent;
    opacity: 0.6;
  }

  .day.sel {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .n {
    font-size: 0.78rem;
    font-weight: 600;
    width: 1.55rem;
    height: 1.55rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .today .n {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .day :global(.cover .generated) {
    padding: 2px;
  }

  .day :global(.cover .generated span) {
    display: none;
  }

  .more {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-2);
    line-height: 1;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.5rem;
    margin: 0.7rem 0 0.9rem;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 999px;
    padding: 0.25rem 0.7rem 0.25rem 0.5rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .key.off {
    color: var(--text-2);
    background: transparent;
    text-decoration: line-through;
  }

  .key.off .sw {
    opacity: 0.35;
  }

  .sw {
    width: 11px;
    height: 16px;
    border-radius: 2px;
    outline-width: 2.5px;
    outline-offset: 0;
    margin-right: 0.2rem;
    --badge: 12px;
  }

  .sw :global(.ev-badge) {
    right: -8px;
    bottom: -5px;
  }

  .dots {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 2px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ev-scheduled);
  }

  .dot.bought {
    background: var(--ev-bought);
  }
  .dot.finished {
    background: var(--ev-finished);
  }
  .dot.started {
    background: var(--ev-started);
  }
  .dot.dnf {
    background: var(--ev-dnf);
  }
  .dot.upcoming {
    background: var(--upcoming);
  }

  .agenda-head {
    justify-content: space-between;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .agenda :global(.row-entry + .row-entry),
  .week-day :global(.row-entry + .row-entry) {
    border-top: 1px solid var(--border);
  }

  .week-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .week-day.today {
    border-color: var(--accent);
  }

  .later {
    margin-top: 1rem;
  }

  .later h3 {
    font-weight: 600;
    margin-bottom: 0.2rem;
  }

  @media (min-width: 700px) {
    .day {
      min-height: 104px;
    }

    .day :global(.cover) {
      width: 40px !important;
    }
  }
</style>
