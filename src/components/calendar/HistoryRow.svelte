<script lang="ts">
  import { daysBetween, type HistoryEvent } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { formatMoney } from '../../lib/util';
  import EventCover from './EventCover.svelte';

  // Something that happened: started, finished, did not finish, bought.
  let { event, showDate = false, coverWidth = 44 }: { event: HistoryEvent; showDate?: boolean; coverWidth?: number } = $props();

  const item = $derived(event.item);
  const SOURCE: Record<string, string> = { bought: 'Bought', gift: 'Gift', library: 'Borrowed', free: 'Got free', subscription: 'Subscription' };
  const label = $derived(
    event.kind === 'bought'
      ? (SOURCE[event.purchase?.source ?? 'bought'] ?? 'Bought')
      : { started: 'Started', finished: 'Finished', dnf: 'Stopped' }[event.kind],
  );
  const detail = $derived.by(() => {
    const parts: string[] = [];
    if (event.kind === 'finished') {
      const r = event.reading;
      if (r?.startDate && r.finishDate) {
        const d = daysBetween(r.startDate, r.finishDate) + 1;
        parts.push(`read in ${d} day${d === 1 ? '' : 's'}`);
      }
      if (item.rating) parts.push(`${item.rating}★`);
    } else if (event.kind === 'dnf') parts.push('did not finish');
    else if (event.kind === 'started') {
      const earlier = library.readings(item.id).filter((r) => r.id !== event.reading?.id && (r.startDate ?? r.finishDate ?? '') < event.date);
      parts.push(earlier.length ? 'started a re-read' : 'started reading');
    } else if (event.purchase) {
      const p = event.purchase;
      if (p.price !== undefined) parts.push(formatMoney(p.price, p.currency));
      if (p.store) parts.push(p.store);
    }
    return parts.join(' · ');
  });
</script>

<div class="row-entry">
  <div class="time">
    {#if showDate}<span class="d">{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>{/if}
    <strong>{label}</strong>
  </div>
  <a href="#/item/{item.id}" aria-hidden="true" tabindex="-1"><EventCover {item} kind={event.kind} width={coverWidth} /></a>
  <div class="info">
    <a class="title" href="#/item/{item.id}">{item.title}</a>
    <span class="small muted">{library.authorNames(item) || (item.type === 'fic' ? 'Fic' : 'Book')}</span>
    {#if detail}<span class="small muted">{detail}</span>{/if}
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
    width: 4.4rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    color: var(--text-2);
    padding-top: 0.1rem;
  }

  .time strong {
    font-size: 0.9rem;
    color: var(--text);
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
