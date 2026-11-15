<script lang="ts">
  import { TYPES } from '../lib/constants';
  import { finishedInYear, goalPace } from '../lib/stats';
  import { library } from '../lib/store.svelte';
  import type { Goal, ItemType } from '../lib/types';
  import { parseNumber, today } from '../lib/util';
  import Meter from './charts/Meter.svelte';

  // Yearly goals: books, manga and fics separately, plus their combined total.
  let { year, compact = false }: { year: number; compact?: boolean } = $props();

  const FIELD: Record<ItemType, 'books' | 'manga' | 'fics'> = { book: 'books', manga: 'manga', fic: 'fics' };
  const PLACEHOLDER: Record<ItemType, string> = { book: 'e.g. 50', manga: 'e.g. 40', fic: 'e.g. 30' };

  const goal = $derived(library.goal(year));
  const done = $derived(finishedInYear(library.data, year));
  let editing = $state(false);
  let inputs = $state<Record<ItemType, string>>({ book: '', manga: '', fic: '' });

  /** Each type with a goal: its target and how many are finished. */
  const meters = $derived(
    TYPES.filter((t) => goal?.[FIELD[t.value]]).map((t) => ({ ...t, target: goal![FIELD[t.value]]!, count: done[t.value] })),
  );

  function pace(target: number, count: number): string {
    const { ahead } = goalPace(target, count, year, today());
    const n = Math.round(ahead);
    if (year < new Date().getFullYear()) return count >= target ? 'Goal reached' : `${target - count} short`;
    if (count >= target) return 'Goal reached';
    if (n === 0) return 'On pace';
    return n > 0 ? `${n} ahead of pace` : `${-n} behind pace`;
  }

  function edit() {
    for (const t of TYPES) inputs[t.value] = goal?.[FIELD[t.value]]?.toString() ?? '';
    editing = true;
  }

  async function save(e: Event) {
    e.preventDefault();
    const patch: Partial<Pick<Goal, 'books' | 'manga' | 'fics'>> = {};
    for (const t of TYPES) {
      const n = parseNumber(inputs[t.value]);
      patch[FIELD[t.value]] = n && n > 0 ? Math.round(n) : undefined;
    }
    await library.saveGoal(year, patch);
    editing = false;
  }

  const together = $derived(
    meters.length > 1 ? { target: meters.reduce((s, m) => s + m.target, 0), count: meters.reduce((s, m) => s + m.count, 0) } : undefined,
  );
</script>

<section class="card goals" class:compact>
  <div class="head">
    <h2>{year} reading goal</h2>
    {#if !editing}
      <button type="button" class="btn ghost small" onclick={edit}>{meters.length ? 'Edit' : 'Set a goal'}</button>
    {/if}
  </div>
  {#if editing}
    <form class="edit" onsubmit={save}>
      {#each TYPES as t (t.value)}
        <label class="field"><span>{t.plural}</span><input inputmode="numeric" bind:value={inputs[t.value]} placeholder={PLACEHOLDER[t.value]} /></label>
      {/each}
      <div class="row">
        <button class="btn primary small">Save</button>
        <button type="button" class="btn small" onclick={() => (editing = false)}>Cancel</button>
      </div>
    </form>
  {:else if meters.length}
    <div class="meters" style:--n={meters.length + (together ? 1 : 0)}>
      {#each meters as m (m.value)}<Meter label={m.plural} done={m.count} goal={m.target} note={pace(m.target, m.count)} />{/each}
      {#if together}
        <Meter label="Together" done={together.count} goal={together.target} note={pace(together.target, together.count)} />
      {/if}
    </div>
  {:else}
    <p class="small muted">No goal yet. Finished books, manga and fics count towards it automatically.</p>
  {/if}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  .meters {
    display: grid;
    gap: 1rem;
    margin-top: 0.8rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 700px) {
    .meters {
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    }
  }

  .edit {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }

  .edit .field {
    width: 7rem;
  }

  p {
    margin: 0.5rem 0 0;
  }
</style>
