<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // Native <dialog>: full-screen sheet on phones, centred card on larger screens.
  let {
    open,
    title,
    onclose,
    children,
    footer,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={onclose}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
>
  {#if open}
    <div class="inner">
      <header>
        <h2>{title}</h2>
        <button type="button" class="btn ghost icon" aria-label="Close" onclick={onclose}>
          <Icon name="close" />
        </button>
      </header>
      <div class="body">{@render children()}</div>
      {#if footer}<footer>{@render footer()}</footer>{/if}
    </div>
  {/if}
</dialog>

<style>
  dialog {
    padding: 0;
    border: none;
    /* Full-screen on phones: the status-bar strip stays dark behind the white time and battery. */
    background: linear-gradient(var(--status-bar) var(--sat), var(--surface) var(--sat));
    color: var(--text);
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    margin: 0;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  @media (min-width: 640px) {
    dialog {
      background: var(--surface);
      width: min(560px, calc(100% - 2rem));
      height: auto;
      max-height: calc(100% - 4rem);
      margin: auto;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
  }

  .inner {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    /* Full-screen on phones: keep clear of the time and battery. */
    padding: calc(0.75rem + var(--sat)) 0.75rem 0.25rem 1.1rem;
  }

  @media (min-width: 640px) {
    header {
      padding-top: 0.75rem;
    }
  }

  h2 {
    margin: 0;
  }

  .body {
    padding: 0.5rem 1.1rem 1.1rem;
    overflow-y: auto;
    flex: 1;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.1rem;
    border-top: 1px solid var(--border);
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
</style>
