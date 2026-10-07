<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';

  // A bottom sheet over the book (a side panel on wide screens).
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
</script>

<div class="sheet" role="dialog" aria-label={title}>
  <div class="row head">
    <h2>{title}</h2>
    <button type="button" class="btn ghost icon" aria-label="Close" onclick={onclose}><Icon name="close" /></button>
  </div>
  {@render children()}
</div>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    max-height: calc(100% - env(safe-area-inset-top) - 2rem);
    overflow-y: auto;
    background: var(--surface);
    color: var(--text);
    border-radius: 16px 16px 0 0;
    padding: 0.9rem 1.1rem calc(0.6rem + env(safe-area-inset-bottom));
    box-shadow: 0 -6px 24px rgb(0 0 0 / 0.2);
  }

  @media (min-width: 700px) {
    .sheet {
      left: auto;
      right: 1rem;
      bottom: 1rem;
      width: 420px;
      border-radius: 14px;
    }
  }

  .head {
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 1.2rem;
  }
</style>
