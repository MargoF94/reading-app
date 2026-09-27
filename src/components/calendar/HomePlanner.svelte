<script lang="ts">
  import { addDays, durationLabel, occurrences, releaseLabel, releaseNotices, type ReleaseNotice } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { today } from '../../lib/util';
  import Cover from '../Cover.svelte';
  import Icon from '../Icon.svelte';
  import ScheduleDialog from './ScheduleDialog.svelte';

  // Home: books coming out soon (dismissible) and the next planned reading.
  const DISMISSED_KEY = 'reading-app:dismissed-releases';

  function loadDismissed(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }

  let dismissed = $state(loadDismissed());
  const day = today();
  const notices = $derived(releaseNotices(library.items, day, dismissed));

  function dismiss(n: ReleaseNotice) {
    dismissed = new Set([...dismissed, n.key]);
    try {
      // Keep only keys for books not out yet, so the list doesn't grow forever.
      const keep = [...dismissed].filter((k) => (k.split('|')[1] ?? '') >= day);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(keep));
    } catch {
      /* storage blocked: the notice comes back next time */
    }
  }

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });

  const upNext = $derived(
    occurrences(library.schedule, day, addDays(day, 6))
      .filter((o) => o.endAt > now)
      .slice(0, 3),
  );

  function when(start: Date, end: Date, date: string): string {
    const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
    if (mins <= 0 && end > now) return 'Now';
    const label =
      date === day
        ? 'Today'
        : date === addDays(day, 1)
          ? 'Tomorrow'
          : new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return label;
  }

  function inHowLong(start: Date): string {
    const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
    if (mins <= 0 || mins >= 24 * 60) return '';
    const h = Math.floor(mins / 60);
    return `in ${h ? `${h} h ` : ''}${mins % 60 || !h ? `${mins % 60} min` : ''}`.trim();
  }

  let scheduleFor = $state<{ itemId: string; date: string } | null>(null);
</script>

{#if notices.length}
  <div class="notices">
    {#each notices as n (n.key)}
      <div class="card notice">
        <a href="#/item/{n.item.id}" aria-hidden="true" tabindex="-1"><Cover item={n.item} width={46} /></a>
        <div class="text">
          <span class="eyebrow">{releaseLabel(n.days)}</span>
          <a class="title" href="#/item/{n.item.id}">{n.item.title}</a>
          <span class="small muted">
            {new Date(`${n.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}{library.authorNames(
              n.item,
            )
              ? ` · ${library.authorNames(n.item)}`
              : ''}
          </span>
          <div>
            <button type="button" class="btn small" onclick={() => (scheduleFor = { itemId: n.item.id, date: n.date })}>
              <Icon name="calendar" size={15} /> Schedule first read
            </button>
          </div>
        </div>
        <button type="button" class="btn ghost icon small x" aria-label="Dismiss notice about “{n.item.title}”" onclick={() => dismiss(n)}>
          <Icon name="close" size={16} />
        </button>
      </div>
    {/each}
  </div>
{/if}

{#if upNext.length}
  <section class="up-next">
    <div class="row head">
      <h2>Up next</h2>
      <a class="small" href="#/calendar">Calendar</a>
    </div>
    <div class="list">
      {#each upNext as o (o.key)}
        {@const item = library.item(o.session.itemId)}
        {#if item}
          <a class="card next" href="#/item/{item.id}">
            <Cover {item} width={40} />
            <span class="text">
              <span class="when"><strong>{when(o.startAt, o.endAt, o.date)} {o.session.start}</strong>
                {#if inHowLong(o.startAt)}<span class="small muted"> · {inHowLong(o.startAt)}</span>{/if}</span>
              <span class="title">{item.title}</span>
              <span class="small muted">{durationLabel(o.session.minutes)}{o.session.note ? ` · ${o.session.note}` : ''}</span>
            </span>
          </a>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<ScheduleDialog open={!!scheduleFor} itemId={scheduleFor?.itemId} date={scheduleFor?.date} onclose={() => (scheduleFor = null)} />

<style>
  .notices {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.2rem;
  }

  .notice {
    display: flex;
    gap: 0.8rem;
    align-items: flex-start;
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    overflow-wrap: anywhere;
  }

  .eyebrow {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
  }

  .title {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }

  .notice .btn.small {
    margin-top: 0.35rem;
  }

  .x {
    flex-shrink: 0;
  }

  .up-next {
    margin-bottom: 1.5rem;
  }

  .head {
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .head h2 {
    margin: 0;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .next {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    color: inherit;
    text-decoration: none;
  }

  .next:hover .title {
    color: var(--accent);
  }
</style>
