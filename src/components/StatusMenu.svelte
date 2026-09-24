<script lang="ts">
  import { STATUSES, STATUS_LABEL } from '../lib/constants';
  import { readingRemovedByUndo } from '../lib/reading';
  import { library } from '../lib/store.svelte';
  import type { Item, Status } from '../lib/types';
  import Icon from './Icon.svelte';

  let { item, compact = false }: { item: Item; compact?: boolean } = $props();

  let open = $state(false);
  const status = $derived(library.status(item.id));
  const done = $derived(status === 'read' || status === 'dnf');

  async function pick(target: Status | 'again') {
    open = false;
    if (target === 'again') {
      await library.setStatus(item, 'currently-reading');
      return;
    }
    if (target === status) return;
    if (target === 'want-to-read') {
      const r = readingRemovedByUndo(library.readings(item.id));
      if (r && (r.log.length || r.startDate || r.finishDate)) {
        const ok = confirm(
          'Move back to Want to Read? This deletes the latest read-through, including its dates and progress notes.',
        );
        if (!ok) return;
      }
    }
    await library.setStatus(item, target);
  }
</script>

<div
  class="status-menu"
  class:compact
  onfocusout={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) open = false;
  }}
>
  <button
    type="button"
    class="btn toggle status-{status}"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {STATUS_LABEL[status]}
    <Icon name="chevron" size={16} />
  </button>
  {#if open}
    <div class="menu" role="menu">
      {#each STATUSES as s (s.value)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={s.value === status}
          class:current={s.value === status}
          onclick={() => pick(s.value)}
        >
          {#if s.value === status}<Icon name="check" size={16} />{:else}<span class="sp"></span>{/if}
          {s.label}
        </button>
      {/each}
      {#if done}
        <hr />
        <button type="button" role="menuitem" onclick={() => pick('again')}>
          <span class="sp"></span>Read again
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .status-menu {
    position: relative;
    display: inline-block;
  }

  .toggle {
    min-width: 11rem;
    justify-content: space-between;
  }

  .compact .toggle {
    min-width: 0;
    min-height: 32px;
    font-size: 0.85rem;
    padding: 0.2em 0.6em;
  }

  .status-want-to-read {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }

  .status-currently-reading {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent-soft);
  }

  .menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 4px);
    left: 0;
    min-width: 12rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    padding: 4px;
    display: flex;
    flex-direction: column;
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 0.5em;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    padding: 0.55em 0.7em;
    border-radius: 4px;
  }

  .menu button:hover {
    background: var(--surface-2);
  }

  .current {
    font-weight: 600;
    color: var(--accent) !important;
  }

  .sp {
    width: 16px;
  }

  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }
</style>
