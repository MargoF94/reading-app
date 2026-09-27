<script lang="ts">
  import { nextOccurrence, type Occurrence } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import type { Item, ReadingSession } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import ScheduleDialog from './ScheduleDialog.svelte';
  import SessionRow from './SessionRow.svelte';

  // Upcoming reading times for one book or fic.
  let { item }: { item: Item } = $props();

  const upcoming = $derived.by(() => {
    const now = new Date();
    return library.schedule
      .filter((s) => s.itemId === item.id)
      .map((s) => nextOccurrence(s, now))
      .filter((o): o is Occurrence => !!o)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  });

  let dialog = $state<{ open: boolean; session?: ReadingSession }>({ open: false });
</script>

<section>
  <div class="row head">
    <h2>Reading schedule</h2>
    <div class="row">
      {#if upcoming.length}<a class="small" href="#/calendar">Calendar</a>{/if}
      <button type="button" class="btn ghost small" onclick={() => (dialog = { open: true })}>
        <Icon name="calendar" size={16} /> Schedule reading
      </button>
    </div>
  </div>
  {#if upcoming.length}
    <div class="list">
      {#each upcoming as occ (occ.key)}
        <SessionRow {occ} showDate coverWidth={36} onedit={() => (dialog = { open: true, session: occ.session })} />
      {/each}
    </div>
  {:else}
    <p class="small muted">No reading time planned.</p>
  {/if}
</section>

<ScheduleDialog open={dialog.open} session={dialog.session} itemId={item.id} onclose={() => (dialog = { open: false })} />

<style>
  .head {
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.2rem;
  }

  h2 {
    margin: 0;
  }

  .list :global(.row-entry + .row-entry) {
    border-top: 1px solid var(--border);
  }
</style>
