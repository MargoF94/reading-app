<script lang="ts">
  import { entryLabel, newReading } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item, Reading } from '../lib/types';
  import { formatDate, nowIso } from '../lib/util';
  import { FORMAT_LABEL } from '../lib/constants';
  import Icon from './Icon.svelte';
  import ReadingEditDialog from './ReadingEditDialog.svelte';

  let { item }: { item: Item } = $props();

  const readings = $derived([...library.readings(item.id)].reverse());
  let editing = $state<Reading | null>(null);
  let isNew = $state(false);

  const OUTCOME_LABEL = { reading: 'Reading', 'on-hold': 'On hold', finished: 'Finished', dnf: 'DNF' };

  function dates(r: Reading): string {
    const s = formatDate(r.startDate);
    const f = formatDate(r.finishDate);
    if (s && f) return `${s} – ${f}`;
    if (s) return `Started ${s}`;
    if (f) return `${r.outcome === 'dnf' ? 'Stopped' : 'Finished'} ${f}`;
    return 'No dates';
  }

  function addPast() {
    isNew = true;
    editing = newReading(item, nowIso(), { outcome: 'finished' });
  }
</script>

<section>
  <div class="row head">
    <h2>Reading history</h2>
    <button type="button" class="btn small" onclick={addPast}>Add a past read</button>
  </div>
  {#if readings.length === 0}
    <p class="muted small">Not started yet.</p>
  {:else}
    <ol class="history">
      {#each readings as r, i (r.id)}
        <li>
          <div class="grow">
            <div class="row">
              <strong>{readings.length > 1 ? `Read ${readings.length - i}` : 'Read-through'}</strong>
              <span class="chip outcome-{r.outcome}">{OUTCOME_LABEL[r.outcome]}</span>
              {#if r.format}<span class="chip">{FORMAT_LABEL[r.format]}</span>{/if}
            </div>
            <div class="small muted">{dates(r)}</div>
            {#if r.log.length}
              <details>
                <summary class="small">{r.log.length} progress {r.log.length === 1 ? 'update' : 'updates'}</summary>
                <ul class="log">
                  {#each [...r.log].reverse() as e (e.id)}
                    <li class="small">
                      <strong>{entryLabel(item, e)}</strong> · <span class="muted">{formatDate(e.date)}</span>
                      {#if e.note}<div>{e.note}</div>{/if}
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
          </div>
          <button
            type="button"
            class="btn ghost icon"
            aria-label="Edit read-through"
            onclick={() => {
              isNew = false;
              editing = r;
            }}
          >
            <Icon name="edit" size={18} />
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<ReadingEditDialog {item} reading={editing} {isNew} onclose={() => (editing = null)} />

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  .head h2 {
    margin: 0;
  }

  .history {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .history > li {
    display: flex;
    gap: 0.5rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--border);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .outcome-reading {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .outcome-finished {
    color: var(--ok);
  }

  .outcome-dnf {
    color: var(--danger);
  }

  details {
    margin-top: 0.3rem;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  .log {
    list-style: none;
    padding: 0 0 0 0.8rem;
    margin: 0.4rem 0 0;
    border-left: 2px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
</style>
