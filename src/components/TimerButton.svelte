<script lang="ts">
  import { clock, timer } from '../lib/timer.svelte';
  import type { Item } from '../lib/types';
  import Icon from './Icon.svelte';

  // Starts the reading timer for this book (or shows that it's running).
  let { item, small = true }: { item: Item; small?: boolean } = $props();
  const mine = $derived(timer.isFor(item.id));

  async function start() {
    if (timer.state && !mine) {
      if (!confirm('A timer is running for another book. Stop and log it, and start one for this book?')) return;
    }
    await timer.start(item.id);
  }
</script>

{#if mine}
  <button type="button" class="btn" class:small aria-label="Timer running" onclick={() => (timer.running ? timer.pause() : timer.resume())}>
    <Icon name="timer" size={16} />
    {clock(timer.elapsedMs)}
    {timer.running ? '· Pause' : '· Resume'}
  </button>
{:else}
  <button type="button" class="btn" class:small onclick={start}><Icon name="timer" size={16} /> Start timer</button>
{/if}
