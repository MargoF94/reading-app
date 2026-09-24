<script lang="ts">
  let { label, value, sub = '' }: { label: string; value: string; sub?: string } = $props();
</script>

<div class="tile">
  <span class="label">{label}</span>
  <span class="value">{value}</span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .label {
    font-size: 0.8rem;
    color: var(--text-2);
    font-weight: 500;
  }

  .value {
    font-size: 1.6rem;
    font-weight: 600;
    line-height: 1.2;
    font-family: var(--font);
  }

  .sub {
    font-size: 0.75rem;
    color: var(--text-2);
  }
</style>
