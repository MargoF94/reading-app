<script lang="ts">
  import { addToPhoneCalendar, openInGoogleCalendar } from '../../lib/calendarExport';
  import { durationLabel, endTime, REPEAT_LABEL, type Occurrence } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';
  import Cover from '../Cover.svelte';
  import Icon from '../Icon.svelte';

  // One planned reading time in an agenda.
  let {
    occ,
    onedit,
    showDate = false,
    coverWidth = 44,
  }: { occ: Occurrence; onedit?: () => void; showDate?: boolean; coverWidth?: number } = $props();

  const s = $derived(occ.session);
  const item = $derived(library.item(s.itemId));
  let menu = $state<'' | 'export' | 'remove'>('');

  const dayLabel = $derived(
    new Date(`${occ.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  );

  async function removeThis() {
    await library.saveSession({ ...s, skipped: [...new Set([...(s.skipped ?? []), occ.date])] });
    menu = '';
    toasts.show(`Removed ${dayLabel} only.`);
  }

  async function removeAll() {
    await library.deleteSession(s);
    menu = '';
    toasts.show('Reading time removed.');
  }

  function remove() {
    if (s.repeat) menu = menu === 'remove' ? '' : 'remove';
    else if (confirm(`Remove this reading time for “${item?.title}”?`)) void removeAll();
  }
</script>

{#if item}
  <div class="row-entry">
    <div class="time">
      {#if showDate}<span class="d">{dayLabel}</span>{/if}
      <strong>{s.start}</strong>
      <span>{durationLabel(s.minutes)}</span>
    </div>
    <a href="#/item/{item.id}" class="ring scheduled" aria-hidden="true" tabindex="-1"><Cover {item} width={coverWidth} /></a>
    <div class="info">
      <a class="title" href="#/item/{item.id}">{item.title}</a>
      <span class="small muted">{library.authorNames(item) || (item.type === 'fic' ? 'Fic' : 'Book')} · until {endTime(s.start, s.minutes)}</span>
      <span class="meta small muted">
        {#if s.remind !== undefined}<span><Icon name="bell" size={13} /> {s.remind === 0 ? 'at start' : `${s.remind} min before`}</span>{/if}
        {#if s.repeat}<span><Icon name="repeat" size={13} /> {REPEAT_LABEL[s.repeat].toLowerCase()}</span>{/if}
      </span>
      {#if s.note}<span class="small note">{s.note}</span>{/if}
      {#if menu === 'export'}
        <div class="menu">
          <button type="button" class="btn small" onclick={() => ((menu = ''), addToPhoneCalendar(s, item))}>Calendar file (iPhone, most apps)</button>
          <button type="button" class="btn small" onclick={() => ((menu = ''), openInGoogleCalendar(s, item))}>Google Calendar</button>
        </div>
      {:else if menu === 'remove'}
        <div class="menu">
          <button type="button" class="btn small" onclick={removeThis}>Only {dayLabel}</button>
          <button type="button" class="btn small danger" onclick={removeAll}>Every time</button>
          <button type="button" class="btn small ghost" onclick={() => (menu = '')}>Cancel</button>
        </div>
      {/if}
    </div>
    <div class="acts">
      {#if onedit}
        <button type="button" class="btn ghost icon small" aria-label="Change reading time for “{item.title}”" onclick={onedit}>
          <Icon name="edit" size={16} />
        </button>
      {/if}
      <button
        type="button"
        class="btn ghost icon small"
        aria-label="Add “{item.title}” to my phone’s calendar"
        aria-expanded={menu === 'export'}
        onclick={() => (menu = menu === 'export' ? '' : 'export')}
      >
        <Icon name="calendar" size={16} />
      </button>
      <button type="button" class="btn ghost icon small" aria-label="Remove reading time for “{item.title}”" onclick={remove}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  </div>
{/if}

<style>
  .row-entry {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    padding: 0.6rem 0;
  }

  .time {
    width: 3.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    color: var(--text-2);
    padding-top: 0.1rem;
  }

  .time strong {
    font-size: 1rem;
    color: var(--text);
  }

  .time .d {
    font-weight: 600;
    color: var(--text);
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    overflow-wrap: anywhere;
  }

  .title {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.7rem;
  }

  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .note {
    font-style: italic;
  }

  .menu {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.4rem;
  }

  .acts {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
</style>
