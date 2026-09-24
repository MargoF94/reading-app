<script lang="ts">
  import type { ItemDraft } from '../lib/drafts';
  import { draftFromFile } from '../lib/import/payload';
  import Icon from './Icon.svelte';

  // Reads an AO3 EPUB or HTML download (or a saved page) and hands the fic's details over.
  let { onimport }: { onimport: (draft: ItemDraft) => void } = $props();

  let input: HTMLInputElement | undefined = $state();
  let message = $state('');

  async function read(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    message = '';
    try {
      const draft = await draftFromFile(file);
      if (draft.type !== 'fic') throw new Error('That file is a book page, not an AO3 fic.');
      onimport(draft);
      message = `Filled in from the AO3 ${/\.epub$/i.test(file.name) ? 'EPUB' : 'page'}. Check the details below.`;
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    } finally {
      if (input) input.value = '';
    }
  }
</script>

<div class="card fic-import">
  <div class="row">
    <div class="grow">
      <span class="label">Fill in from AO3</span>
      <p class="small muted">
        On AO3, open the fic and use <strong>Download → EPUB</strong> or <strong>HTML</strong>, or save the page from
        your browser. Then choose the file. The <a href="#/import">AO3 bookmarklet</a> does it in one click.
      </p>
    </div>
    <button type="button" class="btn" onclick={() => input?.click()}>
      <Icon name="upload" size={18} /> Choose file
    </button>
  </div>
  <input bind:this={input} type="file" accept=".epub,.html,.htm,application/epub+zip,text/html" hidden onchange={read} />
  {#if message}<p class="small msg" role="status">{message}</p>{/if}
</div>

<style>
  .fic-import {
    padding: 0.8rem 1rem;
  }

  .row {
    flex-wrap: nowrap;
    align-items: center;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  p {
    margin: 0.2rem 0 0;
  }

  .msg {
    margin-top: 0.6rem;
  }

  @media (max-width: 480px) {
    .row {
      flex-wrap: wrap;
    }
  }
</style>
