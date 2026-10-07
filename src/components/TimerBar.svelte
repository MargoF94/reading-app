<script lang="ts">
  import { library } from '../lib/store.svelte';
  import { clock, timer } from '../lib/timer.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { formatDuration } from '../lib/readingTime';
  import Icon from './Icon.svelte';

  // The running reading timer, shown above the tab bar on every page.
  const item = $derived(timer.state ? library.item(timer.state.itemId) : undefined);
  let confirming = $state(false);
  let minutes = $state(0);

  function askStop() {
    void timer.pause();
    minutes = Math.max(1, Math.round(timer.elapsedMs / 60000));
    confirming = true;
  }

  async function log() {
    const title = item?.title ?? 'the book';
    const secs = await timer.stop(Math.max(0, Number(minutes) || 0));
    confirming = false;
    toasts.show(secs ? `Logged ${formatDuration(secs)} on “${title}”.` : 'Nothing logged (under a minute).');
  }

  async function discard() {
    if (!confirm('Discard this timer without logging it?')) return;
    await timer.discard();
    confirming = false;
  }
</script>

{#if timer.state}
  <div class="timer-bar" role="region" aria-label="Reading timer">
    <Icon name="timer" size={20} />
    <div class="what">
      <a class="title" href="#/item/{timer.state.itemId}">Reading {item?.title ?? '…'}</a>
      {#if !confirming}<span class="clock" aria-live="off">{clock(timer.elapsedMs)}</span>{/if}
    </div>
    {#if confirming}
      <label class="mins">
        <span class="visually-hidden">Minutes to log</span>
        <input type="number" min="0" max="1440" inputmode="numeric" bind:value={minutes} /> min
      </label>
      <button type="button" class="btn small primary" onclick={log}>Log</button>
      <button type="button" class="btn small ghost" onclick={discard}>Discard</button>
      <button type="button" class="btn small ghost" aria-label="Keep the timer going" onclick={() => { confirming = false; void timer.resume(); }}>Back</button>
    {:else}
      {#if timer.running}
        <button type="button" class="btn small" onclick={() => timer.pause()}>Pause</button>
      {:else}
        <button type="button" class="btn small" onclick={() => timer.resume()}>Resume</button>
      {/if}
      <button type="button" class="btn small primary" onclick={askStop}>Stop &amp; log</button>
    {/if}
  </div>
{/if}

<style>
  /* Keep the end of the page clear of the bar. */
  :global(body:has(.timer-bar) main) {
    padding-bottom: calc(var(--nav-h) + 6rem + env(safe-area-inset-bottom));
  }

  .timer-bar {
    position: fixed;
    left: 0.6rem;
    right: 0.6rem;
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 0.5rem);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem 0.5rem 0.8rem;
    background: #1d2227;
    color: #f2f3f4;
    border-radius: 12px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
  }

  @media (min-width: 900px) {
    .timer-bar {
      left: auto;
      right: 1.2rem;
      bottom: 1.2rem;
      width: 440px;
    }
  }

  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  .title {
    color: inherit;
    opacity: 0.8;
    font-size: 0.78rem;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clock {
    font-size: 1.1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .mins {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
  }

  .mins input {
    width: 4.2rem;
    padding: 0.3rem 0.4rem;
  }

  .timer-bar :global(.btn) {
    flex-shrink: 0;
  }

  .timer-bar :global(.btn.ghost) {
    color: #f2f3f4;
  }
</style>
