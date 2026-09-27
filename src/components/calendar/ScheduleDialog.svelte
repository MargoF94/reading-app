<script lang="ts">
  import { untrack } from 'svelte';
  import { addToPhoneCalendar, exportByDefault, setExportByDefault } from '../../lib/calendarExport';
  import { durationLabel, REPEAT_LABEL } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';
  import type { Item, ReadingSession, Repeat, Status } from '../../lib/types';
  import { newId, normalize, nowIso, today } from '../../lib/util';
  import Cover from '../Cover.svelte';
  import Modal from '../Modal.svelte';

  // Plan (or change) reading time for a book or fic.
  let {
    open,
    onclose,
    session = undefined,
    itemId = undefined,
    date = undefined,
  }: { open: boolean; onclose: () => void; session?: ReadingSession; itemId?: string; date?: string } = $props();

  const DURATIONS = [15, 30, 45, 60];
  const REMINDERS: [string, string][] = [
    ['', 'No reminder'],
    ['0', 'At the start'],
    ['5', '5 min before'],
    ['10', '10 min before'],
    ['15', '15 min before'],
    ['30', '30 min before'],
    ['60', '1 hour before'],
  ];

  let chosen = $state('');
  let day = $state('');
  let start = $state('');
  let minutes = $state(30);
  let customMinutes = $state('');
  let custom = $state(false);
  let remind = $state('10');
  let repeat = $state<'' | Repeat>('');
  let note = $state('');
  let exportIt = $state(true);
  let search = $state('');
  let error = $state('');
  let saving = $state(false);

  // Fill the form each time it opens (and only then: later edits must not reset it).
  $effect(() => {
    if (open) untrack(fill);
  });

  function fill() {
    chosen = session?.itemId ?? itemId ?? '';
    day = session?.date ?? date ?? today();
    start = session?.start ?? nextHalfHour();
    minutes = session?.minutes ?? 30;
    custom = !DURATIONS.includes(minutes);
    customMinutes = custom ? String(minutes) : '';
    remind = session ? (session.remind === undefined ? '' : String(session.remind)) : '10';
    repeat = session?.repeat ?? '';
    note = session?.note ?? '';
    exportIt = session ? false : exportByDefault();
    search = '';
    error = '';
  }

  function nextHalfHour(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const ORDER: Record<Status, number> = { 'currently-reading': 0, 'want-to-read': 1, 'on-hold': 2, read: 3, dnf: 4 };
  const choices = $derived.by(() => {
    const needle = normalize(search.trim());
    const list = library.items.filter(
      (i) => !needle || normalize(`${i.title}\n${i.originalTitle ?? ''}\n${library.authorNames(i)}`).includes(needle),
    );
    list.sort((a, b) => ORDER[library.status(a.id)] - ORDER[library.status(b.id)] || a.title.localeCompare(b.title));
    const picked = chosen ? library.item(chosen) : undefined;
    const top = list.slice(0, 24);
    return picked && !top.includes(picked) && !needle ? [picked, ...top] : top;
  });
  const pickedItem = $derived(chosen ? library.item(chosen) : undefined);

  async function save(e: Event) {
    e.preventDefault();
    const length = custom ? Number(customMinutes) : minutes;
    if (!pickedItem) return (error = 'Choose a book or fic.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return (error = 'Choose a day.');
    if (!/^\d{2}:\d{2}$/.test(start)) return (error = 'Choose a start time.');
    if (!Number.isFinite(length) || length < 5 || length > 24 * 60) return (error = 'Reading time should be 5 minutes to 24 hours.');
    saving = true;
    try {
      const now = nowIso();
      const record: ReadingSession = {
        id: session?.id ?? newId(),
        createdAt: session?.createdAt ?? now,
        updatedAt: now,
        itemId: pickedItem.id,
        date: day,
        start,
        minutes: Math.round(length),
        remind: remind === '' ? undefined : Number(remind),
        repeat: repeat || undefined,
        // Changing the first day of a series starts it afresh.
        skipped: session && session.date === day && session.repeat === (repeat || undefined) ? session.skipped : undefined,
        note: note.trim() || undefined,
      };
      await library.saveSession(record);
      if (!session) setExportByDefault(exportIt);
      if (exportIt) addToPhoneCalendar(record, pickedItem);
      toasts.show(session ? 'Reading time updated.' : `Scheduled “${pickedItem.title}”.`);
      onclose();
    } finally {
      saving = false;
    }
  }
</script>

<Modal {open} title={session ? 'Change reading time' : 'Schedule reading'} {onclose}>
  <form id="schedule-form" class="stack form" onsubmit={save}>
    <fieldset class="stack pick">
      <legend class="label">Book or fic</legend>
      <input type="search" bind:value={search} placeholder="Search your library…" aria-label="Search your library" />
      <div class="choices" role="radiogroup" aria-label="Book or fic">
        {#each choices as item (item.id)}
          {@render choice(item)}
        {:else}
          <p class="small muted">Nothing matches “{search}”.</p>
        {/each}
      </div>
      {#if pickedItem}
        <p class="small" style="margin:0">Reading <strong>{pickedItem.title}</strong></p>
      {:else if !search}
        <p class="small muted" style="margin:0">Currently reading and Want to Read are first.</p>
      {/if}
    </fieldset>

    <div class="two">
      <label class="field"><span>Day</span><input type="date" bind:value={day} required /></label>
      <label class="field"><span>Starts</span><input type="time" bind:value={start} required /></label>
    </div>

    <fieldset class="stack">
      <legend class="label">For</legend>
      <div class="chips">
        {#each DURATIONS as d (d)}
          <button
            type="button"
            class="chip-btn"
            class:on={!custom && minutes === d}
            aria-pressed={!custom && minutes === d}
            onclick={() => ((minutes = d), (custom = false))}>{durationLabel(d)}</button
          >
        {/each}
        <button type="button" class="chip-btn" class:on={custom} aria-pressed={custom} onclick={() => (custom = true)}>Other…</button>
      </div>
      {#if custom}
        <label class="field short">
          <span>Minutes</span>
          <input type="number" inputmode="numeric" min="5" max="1440" step="5" bind:value={customMinutes} />
        </label>
      {/if}
    </fieldset>

    <div class="two">
      <label class="field">
        <span>Remind me</span>
        <select bind:value={remind}>
          {#each REMINDERS as [v, l] (v)}<option value={v}>{l}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Repeat</span>
        <select bind:value={repeat}>
          <option value="">Doesn’t repeat</option>
          {#each Object.entries(REPEAT_LABEL) as [v, l] (v)}<option value={v}>{l}</option>{/each}
        </select>
      </label>
    </div>

    <label class="field">
      <span>Note <span class="muted">(optional)</span></span>
      <input bind:value={note} placeholder="e.g. finish part 3" autocomplete="off" />
    </label>

    <label class="export">
      <input type="checkbox" bind:checked={exportIt} />
      <span>
        <strong>{session ? 'Update my phone’s calendar too' : 'Also add to my phone’s calendar'}</strong>
        <span class="small muted">
          Your phone’s calendar alerts you even when this app is closed. You’ll get a calendar file to add{session
            ? ' (remove the old event there yourself)'
            : ''}.
        </span>
      </span>
    </label>

    {#if error}<p class="error small" role="alert" style="margin:0">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="submit" form="schedule-form" class="btn primary" disabled={saving}>{session ? 'Save' : 'Schedule'}</button>
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
  {/snippet}
</Modal>

{#snippet choice(item: Item)}
  {@const on = chosen === item.id}
  <button type="button" class="choice" class:on role="radio" aria-checked={on} onclick={() => (chosen = item.id)} title={item.title}>
    <span class="ring" class:scheduled={on}><Cover {item} width={56} /></span>
    <span class="choice-title">{item.title}</span>
  </button>
{/snippet}

<style>
  .form {
    gap: 1rem;
  }

  fieldset {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.35rem;
  }

  .pick {
    gap: 0.5rem;
  }

  .choices {
    display: flex;
    gap: 0.7rem;
    overflow-x: auto;
    padding: 5px 4px 6px;
    scroll-snap-type: x proximity;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    width: 64px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    scroll-snap-align: start;
  }

  .choice.on {
    color: var(--ok);
    font-weight: 700;
  }

  .choice-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-align: center;
    line-height: 1.2;
  }

  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 999px;
    padding: 0.35em 0.9em;
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .chip-btn.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }

  .short {
    max-width: 160px;
  }

  .export {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    background: var(--ok-soft);
    border-radius: var(--radius-sm);
    padding: 0.7rem 0.8rem;
    cursor: pointer;
  }

  .export input {
    margin-top: 0.2rem;
    width: 1.2rem;
    height: 1.2rem;
    flex-shrink: 0;
    accent-color: var(--ok);
  }

  .export span {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .error {
    color: var(--danger);
  }
</style>
