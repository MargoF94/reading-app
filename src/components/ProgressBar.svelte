<script lang="ts">
  let { percent, label = '' }: { percent: number | undefined; label?: string } = $props();
</script>

<div class="progress">
  <div
    class="track"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={percent !== undefined ? Math.round(percent) : undefined}
    aria-label={label || 'Progress'}
  >
    <div class="bar" style:width="{percent ?? 0}%"></div>
  </div>
  {#if label}<span class="small muted">{label}</span>{/if}
</div>

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .track {
    height: 6px;
    background: var(--surface-2);
    border-radius: 999px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.3s;
  }
</style>
