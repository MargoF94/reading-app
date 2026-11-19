<script lang="ts">
  import { renderMarkdown } from '../lib/markdown';
  import { library } from '../lib/store.svelte';
  import type { Series } from '../lib/types';
  import Icon from './Icon.svelte';

  // Notes on a whole series, on its page: written like a book's notes (Markdown, with
  // ||spoilers||), kept with the series and synced with everything else.
  let { series }: { series: Series } = $props();

  let editing = $state(false);
  let draft = $state('');
  let saving = $state(false);
  let box: HTMLTextAreaElement | undefined = $state();

  function edit() {
    draft = series.notes ?? '';
    editing = true;
  }

  $effect(() => {
    if (editing) box?.focus();
  });

  async function save() {
    saving = true;
    try {
      await library.put('series', [{ ...series, notes: draft.trim() || undefined }]);
      editing = false;
    } finally {
      saving = false;
    }
  }
</script>

{#if editing}
  <form
    class="notes editing"
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <label class="field">
      <span>Notes on this series</span>
      <textarea
        bind:this={box}
        bind:value={draft}
        rows="6"
        placeholder="Reading order, where you stopped, anything to remember. Markdown works: **bold**, *italic*. Hide a spoiler like ||this||."
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === 'Escape') editing = false;
        }}
      ></textarea>
    </label>
    <div class="actions">
      <button type="button" class="btn ghost" onclick={() => (editing = false)}>Cancel</button>
      <button type="submit" class="btn primary" disabled={saving}>Save notes</button>
    </div>
  </form>
{:else if series.notes}
  <section class="notes card">
    <header>
      <h2>Notes</h2>
      <button type="button" class="btn ghost small" onclick={edit}><Icon name="edit" size={16} /> Edit</button>
    </header>
    <div class="prose">{@html renderMarkdown(series.notes)}</div>
  </section>
{:else}
  <button type="button" class="btn small add" onclick={edit}><Icon name="edit" size={16} /> Add notes</button>
{/if}

<style>
  .notes {
    max-width: 760px;
    margin-bottom: 1.2rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.4rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .prose {
    overflow-wrap: anywhere;
  }

  textarea {
    width: 100%;
    resize: vertical;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .add {
    margin-bottom: 1rem;
  }
</style>
