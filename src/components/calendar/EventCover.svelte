<script lang="ts" module>
  export type EventKind = 'scheduled' | 'bought' | 'finished' | 'started' | 'dnf' | 'upcoming';

  /** Legend order (the colors were validated as neighbours in this order). */
  export const EVENT_KINDS: { kind: EventKind; label: string; icon: string }[] = [
    { kind: 'scheduled', label: 'Scheduled', icon: 'clock' },
    { kind: 'bought', label: 'Bought', icon: 'bag' },
    { kind: 'finished', label: 'Finished', icon: 'check' },
    { kind: 'started', label: 'Started', icon: 'play' },
    { kind: 'dnf', label: 'Did not finish', icon: 'close' },
    { kind: 'upcoming', label: 'Coming out', icon: 'gift' },
  ];
  export const EVENT_ICON = Object.fromEntries(EVENT_KINDS.map((k) => [k.kind, k.icon])) as Record<EventKind, string>;
</script>

<script lang="ts">
  import type { Item } from '../../lib/types';
  import Cover from '../Cover.svelte';
  import Icon from '../Icon.svelte';

  // A cover framed in the event's color, with its icon in a corner badge.
  let { item, kind, width = 44, badge = true }: { item: Item; kind: EventKind; width?: number; badge?: boolean } = $props();
  const size = $derived(width < 34 ? 13 : 18);
</script>

<span class="ring {kind}" style:--badge="{size}px">
  <Cover {item} {width} />
  {#if badge}<span class="ev-badge" aria-hidden="true"><Icon name={EVENT_ICON[kind]} size={size} /></span>{/if}
</span>
