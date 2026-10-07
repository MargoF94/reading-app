<script lang="ts">
  import { formatDuration, timeLeft, total } from '../lib/readingTime';
  import { readableFile } from '../lib/reader';
  import { library } from '../lib/store.svelte';
  import type { Item, ReadingTime } from '../lib/types';
  import { formatDate, newId, nowIso, today } from '../lib/util';
  import Icon from './Icon.svelte';
  import TimerButton from './TimerButton.svelte';

  // Time spent reading this book or fic: from the reader, the timer, or added by hand.
  let { item }: { item: Item } = $props();

  const logs = $derived(library.timeFor(item.id));
  const sum = $derived(total(logs));
  const pos = $derived(readableFile(item)?.position);
  const left = $derived(pos ? timeLeft(logs, pos.fraction) : undefined);
  const latest = $derived([...logs].reverse());
  let showAll = $state(false);
  let adding = $state(false);
  let addDate = $state(today());
  let addMinutes = $state<number | undefined>(undefined);

  const SOURCE = { reader: 'in the reader', timer: 'timer', manual: 'added' } as const;

  async function add(e: Event) {
    e.preventDefault();
    const min = Number(addMinutes);
    if (!min || min <= 0) return;
    const now = nowIso();
    const rec: ReadingTime = { id: newId(), createdAt: now, updatedAt: now, itemId: item.id, date: addDate, seconds: Math.round(min * 60), source: 'manual' };
    await library.saveTime(rec);
    adding = false;
    addMinutes = undefined;
  }

  async function remove(t: ReadingTime) {
    if (confirm(`Remove ${formatDuration(t.seconds)} on ${formatDate(t.date)}?`)) await library.deleteTime(t);
  }
</script>

<section>
  <div class="row head">
    <h2>Reading time</h2>
    <div class="row">
      <TimerButton {item} />
      {#if !adding}<button type="button" class="btn ghost small" onclick={() => (adding = true)}><Icon name="plus" size={16} /> Add time</button>{/if}
    </div>
  </div>

  {#if logs.length}
    <p class="sum">
      <strong>{formatDuration(sum)}</strong> read
      {#if left !== undefined && pos && pos.fraction < 0.995}· about <strong>{formatDuration(left)}</strong> left{/if}
    </p>
  {/if}

  {#if adding}
    <form class="add row" onsubmit={add}>
      <label class="field"><span>Day</span><input type="date" bind:value={addDate} max={today()} required /></label>
      <label class="field"><span>Minutes</span><input type="number" min="1" max="1440" inputmode="numeric" bind:value={addMinutes} required /></label>
      <button type="submit" class="btn primary small">Add</button>
      <button type="button" class="btn ghost small" onclick={() => (adding = false)}>Cancel</button>
    </form>
  {/if}

  {#if logs.length}
    <ul class="sessions">
      {#each showAll ? latest : latest.slice(0, 5) as t (t.id)}
        <li>
          <span>{formatDate(t.date)}</span>
          <span class="muted small">{SOURCE[t.source]}</span>
          <span class="dur">{formatDuration(t.seconds)}</span>
          <button type="button" class="btn ghost icon small" aria-label="Remove this time" onclick={() => remove(t)}><Icon name="trash" size={15} /></button>
        </li>
      {/each}
    </ul>
    {#if latest.length > 5}
      <button type="button" class="btn ghost small" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${latest.length}`}</button>
    {/if}
  {:else if !adding}
    <p class="muted small">Time you spend in the app’s reader is counted automatically. For paper books and audiobooks, use the timer or add time.</p>
  {/if}
</section>

<style>
  .head {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }

  h2 {
    margin: 0;
  }

  .sum {
    margin: 0.2rem 0 0.4rem;
  }

  .add {
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.4rem 0 0.6rem;
  }

  .add .field {
    width: auto;
  }

  .add input[type='number'] {
    width: 6rem;
  }

  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sessions li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--border);
  }

  .dur {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
