<script lang="ts">
  import { untrack } from 'svelte';
  import { activeReading, entryLabel, isComplete, latestEntry, unitTotal, unitsFor } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item, ProgressUnit } from '../lib/types';
  import { newId, parseNumber, today } from '../lib/util';
  import Modal from './Modal.svelte';

  let { item, open, onclose }: { item: Item; open: boolean; onclose: () => void } = $props();

  const UNIT_LABEL: Record<ProgressUnit, string> = {
    pages: 'Page',
    percent: 'Percent',
    chapters: 'Chapter',
    minutes: 'Time listened',
  };

  const reading = $derived(activeReading(library.readings(item.id)));
  const last = $derived(latestEntry(reading));

  let unit = $state<ProgressUnit>('pages');
  let value = $state('');
  let hours = $state('');
  let minutes = $state('');
  let date = $state(today());
  let note = $state('');
  let error = $state('');

  // Reset the form each time the dialog opens (and only then).
  $effect(() => {
    if (open) untrack(reset);
  });

  function reset() {
    unit = reading?.unit ?? unitsFor(item)[0];
    const lastInUnit = last && last.unit === unit ? last.value : undefined;
    value = lastInUnit !== undefined ? String(lastInUnit) : '';
    hours = lastInUnit !== undefined ? String(Math.floor(lastInUnit / 60)) : '';
    minutes = lastInUnit !== undefined ? String(Math.round(lastInUnit % 60)) : '';
    date = today();
    note = '';
    error = '';
  }

  const total = $derived(unitTotal(item, unit));
  const totalHint = $derived.by(() => {
    if (unit === 'percent' || !total) return '';
    if (unit === 'chapters' && item.fic?.chaptersTotal === undefined) return ` (${total} posted so far)`;
    return ` (of ${total})`;
  });

  async function save(e: Event) {
    e.preventDefault();
    const v =
      unit === 'minutes'
        ? (parseNumber(hours) ?? 0) * 60 + (parseNumber(minutes) ?? 0)
        : parseNumber(value);
    if (v === undefined || v < 0) {
      error = 'Enter a number.';
      return;
    }
    if (unit === 'percent' && v > 100) {
      error = 'Percent cannot be more than 100.';
      return;
    }
    // Make sure there is an active read-through to log against.
    if (!reading) await library.setStatus(item, 'currently-reading', date);
    const r = activeReading(library.readings(item.id))!;
    const entry = { id: newId(), date, value: v, unit, note: note.trim() || undefined };
    await library.saveReading({ ...r, unit, outcome: 'reading', log: [...r.log, entry] });
    onclose();
    if (isComplete(item, entry) && confirm('Looks like you reached the end. Mark as read?')) {
      await library.setStatus(item, 'read', date);
    }
  }
</script>

<Modal {open} title="Update progress" {onclose}>
  <form id="progress-form" class="stack" onsubmit={save}>
    {#if last}
      <p class="muted small" style="margin:0">Last update: {entryLabel(item, last)}</p>
    {/if}
    <div class="units" role="radiogroup" aria-label="Track by">
      {#each unitsFor(item) as u (u)}
        <label class="unit" class:on={unit === u}>
          <input type="radio" name="unit" value={u} bind:group={unit} class="visually-hidden" />
          {u === 'percent' ? '%' : u === 'minutes' ? 'Time' : u === 'pages' ? 'Pages' : 'Chapters'}
        </label>
      {/each}
    </div>

    {#if unit === 'minutes'}
      <div class="grid-2">
        <label class="field"><span>Hours</span><input inputmode="numeric" bind:value={hours} /></label>
        <label class="field"><span>Minutes</span><input inputmode="numeric" bind:value={minutes} /></label>
      </div>
    {:else}
      <label class="field">
        <span>{UNIT_LABEL[unit]}{totalHint}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input inputmode="decimal" bind:value autofocus />
      </label>
      {#if unit === 'percent'}
        <input type="range" min="0" max="100" step="1" bind:value aria-label="Percent slider" />
      {/if}
    {/if}

    <label class="field"><span>Date</span><input type="date" bind:value={date} max={today()} /></label>
    <label class="field">
      <span>Note (optional)</span>
      <textarea bind:value={note} rows="3" placeholder="Thoughts so far…"></textarea>
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
    <button type="submit" form="progress-form" class="btn primary">Save</button>
  {/snippet}
</Modal>

<style>
  .units {
    display: flex;
    gap: 0.4rem;
  }

  .unit {
    flex: 1;
    text-align: center;
    padding: 0.5em;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 500;
  }

  .unit.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .unit:has(input:focus-visible) {
    outline: 2px solid var(--accent);
  }

  input[type='range'] {
    padding: 0;
    border: none;
    min-height: 32px;
    accent-color: var(--accent);
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
