<script lang="ts">
  import { daysBetween, isFullDate, type Release } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { today } from '../../lib/util';
  import Cover from '../Cover.svelte';

  // A book coming out, in an agenda.
  let { release, showDate = false, coverWidth = 44 }: { release: Release; showDate?: boolean; coverWidth?: number } = $props();

  const item = $derived(release.item);
  const when = $derived.by(() => {
    if (!isFullDate(release.date)) {
      const m = new Date(`${release.date}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return `Comes out in ${m}`;
    }
    const days = daysBetween(today(), release.date);
    const d = new Date(`${release.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (days === 0) return 'Comes out today';
    if (days === 1) return 'Comes out tomorrow';
    return days < 0 ? `Came out ${d}` : `Comes out ${d}`;
  });
</script>

<div class="row-entry">
  <div class="time">
    {#if showDate && isFullDate(release.date)}
      <span class="d">{new Date(`${release.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
    {/if}
    <strong>Out</strong>
    <span>release</span>
  </div>
  <a href="#/item/{item.id}" class="ring upcoming" aria-hidden="true" tabindex="-1"><Cover {item} width={coverWidth} /></a>
  <div class="info">
    <a class="title" href="#/item/{item.id}">{item.title}</a>
    <span class="small muted">{library.authorNames(item) || 'Unknown author'}</span>
    <span class="small muted">{when}</span>
  </div>
</div>

<style>
  .row-entry {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    padding: 0.6rem 0;
  }

  .time {
    width: 3.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    color: var(--text-2);
    padding-top: 0.1rem;
  }

  .time strong {
    font-size: 1rem;
    color: var(--upcoming);
  }

  .time .d {
    font-weight: 600;
    color: var(--text);
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    overflow-wrap: anywhere;
  }

  .title {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
</style>
