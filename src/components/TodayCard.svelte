<script lang="ts">
  import { byDate, formatDuration, streak } from '../lib/readingTime';
  import { library } from '../lib/store.svelte';
  import { timer } from '../lib/timer.svelte';
  import { today } from '../lib/util';
  import Icon from './Icon.svelte';

  // Today's reading against the daily goal, and the streak of days in a row.
  const goal = $derived(library.settings.dailyGoalMinutes ?? 0);
  const days = $derived(byDate(library.readingTime));
  const day = $derived(today());
  // A running timer counts towards today straight away.
  const seconds = $derived((days.get(day) ?? 0) + (timer.state?.date === day ? timer.elapsedMs / 1000 : 0));
  const run = $derived(streak(days, day, goal || undefined));
  const minutes = $derived(Math.floor(seconds / 60));
  const share = $derived(goal ? Math.min(1, minutes / goal) : 0);
  const show = $derived(goal > 0 || library.readingTime.length > 0);
</script>

{#if show}
  <section class="card today" aria-label="Today’s reading">
    {#if goal}
      <div class="ring" style:--p={share} role="img" aria-label="{minutes} of {goal} minutes today">
        <div><strong>{minutes}</strong><span>/{goal} min</span></div>
      </div>
    {/if}
    <div class="text">
      <strong>Today’s reading</strong>
      <span class="small muted">
        {#if !goal}
          {seconds >= 60 ? formatDuration(seconds) : 'Nothing yet today'} · <a href="#/settings">set a daily goal</a>
        {:else if minutes >= goal}
          Goal reached{minutes > goal ? ` · ${formatDuration(seconds)}` : ''}
        {:else}
          {goal - minutes} more {goal - minutes === 1 ? 'minute' : 'minutes'} to reach your goal
        {/if}
      </span>
      {#if run.current > 0 || run.best > 1}
        <span class="streak small">
          <Icon name="flame" size={16} />
          <strong>{run.current}-day streak</strong>
          {#if run.best > run.current}<span class="muted">· best {run.best}</span>{/if}
        </span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .today {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .ring {
    --size: 64px;
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
    border-radius: 50%;
    background: conic-gradient(var(--accent) calc(var(--p) * 360deg), var(--surface-2) 0);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring > div {
    width: calc(var(--size) - 14px);
    height: calc(var(--size) - 14px);
    border-radius: 50%;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .ring strong {
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .ring span {
    font-size: 0.6rem;
    color: var(--text-2);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .streak {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--warn, #9a5b12);
  }
</style>
