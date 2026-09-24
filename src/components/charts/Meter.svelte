<script lang="ts">
  // Goal progress: accent fill on a lighter track of the same hue.
  let { label, done, goal, note = '' }: { label: string; done: number; goal: number; note?: string } = $props();
  const pct = $derived(goal > 0 ? Math.min(100, (done / goal) * 100) : 0);
</script>

<div class="meter">
  <div class="head">
    <span class="label">{label}</span>
    <span class="nums"><strong>{done}</strong> of {goal}</span>
  </div>
  <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax={goal} aria-valuenow={done} aria-label={label}>
    <div class="fill" style:width="{pct}%"></div>
  </div>
  {#if note}<span class="note">{note}</span>{/if}
</div>

<style>
  .meter {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .label {
    font-weight: 500;
  }

  .nums {
    color: var(--text-2);
    white-space: nowrap;
  }

  .nums strong {
    color: var(--text);
  }

  .track {
    height: 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 0.3s;
  }

  .note {
    font-size: 0.8rem;
    color: var(--text-2);
  }
</style>
