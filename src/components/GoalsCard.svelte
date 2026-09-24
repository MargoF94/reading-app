<script lang="ts">
  import { finishedInYear, goalPace } from '../lib/stats';
  import { library } from '../lib/store.svelte';
  import { parseNumber, today } from '../lib/util';
  import Meter from './charts/Meter.svelte';

  // Yearly goals: books and fics separately, plus their combined total.
  let { year, compact = false }: { year: number; compact?: boolean } = $props();

  const goal = $derived(library.goal(year));
  const done = $derived(finishedInYear(library.data, year));
  let editing = $state(false);
  let books = $state('');
  let fics = $state('');

  function pace(target: number, count: number): string {
    const { ahead } = goalPace(target, count, year, today());
    const n = Math.round(ahead);
    if (year < new Date().getFullYear()) return count >= target ? 'Goal reached' : `${target - count} short`;
    if (count >= target) return 'Goal reached';
    if (n === 0) return 'On pace';
    return n > 0 ? `${n} ahead of pace` : `${-n} behind pace`;
  }

  function edit() {
    books = goal?.books?.toString() ?? '';
    fics = goal?.fics?.toString() ?? '';
    editing = true;
  }

  async function save(e: Event) {
    e.preventDefault();
    const b = parseNumber(books);
    const f = parseNumber(fics);
    await library.saveGoal(year, {
      books: b && b > 0 ? Math.round(b) : undefined,
      fics: f && f > 0 ? Math.round(f) : undefined,
    });
    editing = false;
  }

  const hasGoal = $derived(!!(goal?.books || goal?.fics));
</script>

<section class="card goals" class:compact>
  <div class="head">
    <h2>{year} reading goal</h2>
    {#if !editing}
      <button type="button" class="btn ghost small" onclick={edit}>{hasGoal ? 'Edit' : 'Set a goal'}</button>
    {/if}
  </div>
  {#if editing}
    <form class="edit" onsubmit={save}>
      <label class="field"><span>Books</span><input inputmode="numeric" bind:value={books} placeholder="e.g. 50" /></label>
      <label class="field"><span>Fics</span><input inputmode="numeric" bind:value={fics} placeholder="e.g. 30" /></label>
      <div class="row">
        <button class="btn primary small">Save</button>
        <button type="button" class="btn small" onclick={() => (editing = false)}>Cancel</button>
      </div>
    </form>
  {:else if hasGoal}
    <div class="meters">
      {#if goal?.books}<Meter label="Books" done={done.books} goal={goal.books} note={pace(goal.books, done.books)} />{/if}
      {#if goal?.fics}<Meter label="Fics" done={done.fics} goal={goal.fics} note={pace(goal.fics, done.fics)} />{/if}
      {#if goal?.books && goal?.fics}
        <Meter
          label="Together"
          done={done.books + done.fics}
          goal={goal.books + goal.fics}
          note={pace(goal.books + goal.fics, done.books + done.fics)}
        />
      {/if}
    </div>
  {:else}
    <p class="small muted">No goal yet. Finished books and fics count towards it automatically.</p>
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
