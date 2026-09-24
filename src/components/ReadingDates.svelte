<script lang="ts">
  import { activeReading } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item, Reading } from '../lib/types';
  import { today } from '../lib/util';

  // Start / finish dates of the current (or latest) read-through, editable in place.
  let { item }: { item: Item } = $props();

  const readings = $derived(library.readings(item.id));
  const current = $derived<Reading | undefined>(activeReading(readings) ?? readings.at(-1));
  const done = $derived(current?.outcome === 'finished' || current?.outcome === 'dnf');
  let error = $state('');

  async function change(field: 'startDate' | 'finishDate', value: string) {
    if (!current) return;
    const next = { ...current, [field]: value || undefined };
    if (next.startDate && next.finishDate && next.finishDate < next.startDate) {
      error = field === 'startDate' ? 'The start date is after the finish date.' : 'The finish date is before the start date.';
      return;
    }
    error = '';
    await library.saveReading(next);
  }
</script>

{#if current}
  <div class="dates">
    <label>
      <span>Started</span>
      <input
        type="date"
        value={current.startDate ?? ''}
        max={current.finishDate ?? today()}
        onchange={(e) => change('startDate', e.currentTarget.value)}
      />
    </label>
    {#if done}
      <label>
        <span>{current.outcome === 'dnf' ? 'Stopped' : 'Finished'}</span>
        <input
          type="date"
          value={current.finishDate ?? ''}
          min={current.startDate}
          max={today()}
          onchange={(e) => change('finishDate', e.currentTarget.value)}
        />
      </label>
    {/if}
  </div>
  {#if error}<p class="small error" role="alert">{error}</p>{/if}
  {#if readings.length > 1}
    <p class="small muted note">Read {readings.length} times — earlier reads are in Reading history below.</p>
  {/if}
{/if}

<style>
  .dates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    justify-content: center;
  }

  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-2);
  }

  input {
    width: auto;
    min-height: 36px;
    padding: 0.25em 0.5em;
    font-size: 0.9rem;
  }

  @media (min-width: 700px) {
    .dates {
      justify-content: flex-start;
    }
  }

  .error {
    color: var(--danger);
    margin: 0.3rem 0 0;
  }

  .note {
    margin: 0.3rem 0 0;
  }
</style>
