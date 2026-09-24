<script lang="ts">
  import { untrack } from 'svelte';
  import { FORMATS } from '../lib/constants';
  import { entryLabel } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { BookFormat, Item, ProgressEntry, Reading, ReadingOutcome } from '../lib/types';
  import { formatDate } from '../lib/util';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  // Edits one read-through: dates, outcome, format and its progress log.
  // `reading` without an existing record id in the library = "add a past read".
  let {
    item,
    reading,
    isNew = false,
    onclose,
  }: { item: Item; reading: Reading | null; isNew?: boolean; onclose: () => void } = $props();

  let startDate = $state('');
  let finishDate = $state('');
  let outcome = $state<ReadingOutcome>('finished');
  let format = $state<BookFormat | ''>('');
  let log = $state<ProgressEntry[]>([]);
  let error = $state('');

  $effect(() => {
    const r = reading;
    if (r) untrack(() => load(r));
  });

  function load(r: Reading) {
    startDate = r.startDate ?? '';
    finishDate = r.finishDate ?? '';
    outcome = r.outcome;
    format = r.format ?? '';
    log = [...r.log];
    error = '';
  }

  const OUTCOMES: { value: ReadingOutcome; label: string }[] = [
    { value: 'reading', label: 'Reading' },
    { value: 'on-hold', label: 'On hold' },
    { value: 'finished', label: 'Finished' },
    { value: 'dnf', label: 'Did not finish' },
  ];

  async function save(e: Event) {
    e.preventDefault();
    if (!reading) return;
    if (startDate && finishDate && finishDate < startDate) {
      error = 'Finish date is before the start date.';
      return;
    }
    const active = outcome === 'reading' || outcome === 'on-hold';
    const otherActive = library
      .readings(item.id)
      .some((r) => r.id !== reading.id && (r.outcome === 'reading' || r.outcome === 'on-hold'));
    if (active && otherActive) {
      error = 'Another read-through is already in progress. Finish or remove it first.';
      return;
    }
    await library.saveReading({
      ...reading,
      startDate: startDate || undefined,
      finishDate: active ? undefined : finishDate || undefined,
      outcome,
      format: format || undefined,
      log: $state.snapshot(log),
    });
    onclose();
  }

  async function remove() {
    if (!reading || !confirm('Delete this read-through and its progress notes?')) return;
    await library.deleteReading(reading);
    onclose();
  }
</script>

<Modal open={!!reading} title={isNew ? 'Add a read-through' : 'Edit read-through'} {onclose}>
  <form id="reading-form" class="stack" onsubmit={save}>
    <div class="grid-2">
      <label class="field"><span>Started</span><input type="date" bind:value={startDate} /></label>
      <label class="field">
        <span>{outcome === 'dnf' ? 'Stopped' : 'Finished'}</span>
        <input
          type="date"
          bind:value={finishDate}
          disabled={outcome === 'reading' || outcome === 'on-hold'}
        />
      </label>
    </div>
    <div class="grid-2">
      <label class="field">
        <span>Result</span>
        <select bind:value={outcome}>
          {#each OUTCOMES as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </label>
      {#if item.type === 'book'}
        <label class="field">
          <span>Format</span>
          <select bind:value={format}>
            <option value="">—</option>
            {#each FORMATS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
          </select>
        </label>
      {/if}
    </div>

    {#if log.length}
      <div>
        <span class="label">Progress log</span>
        <ul class="log">
          {#each log as entry, i (entry.id)}
            <li>
              <div class="grow">
                <strong>{entryLabel(item, entry)}</strong>
                <span class="muted small">· {formatDate(entry.date)}</span>
                {#if entry.note}<div class="small">{entry.note}</div>{/if}
              </div>
              <button
                type="button"
                class="btn ghost icon small"
                aria-label="Delete this update"
                onclick={() => (log = log.filter((_, j) => j !== i))}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>
  {#snippet footer()}
    {#if !isNew}
      <button type="button" class="btn danger" style="margin-right:auto" onclick={remove}>Delete</button>
    {/if}
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
    <button type="submit" form="reading-form" class="btn primary">Save</button>
  {/snippet}
</Modal>

<style>
  .log {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
  }

  .log li {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
