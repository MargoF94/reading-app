<script lang="ts">
  import { library } from '../../lib/store.svelte';
  import type { Item, VocabWord } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import WordEntry from './WordEntry.svelte';
  import WordForm from './WordForm.svelte';

  // Words learned from this book or fic, in the order they were added.
  let { item }: { item: Item } = $props();

  const words = $derived(library.wordsFor(item.id));
  let editing = $state<string | null>(null); // word id, or 'new'

  async function remove(w: VocabWord) {
    if (!confirm(`Remove “${w.word}”?`)) return;
    await library.deleteWord(w);
  }
</script>

<section>
  <div class="row head">
    <h2>Words</h2>
    <div class="row">
      {#if library.vocabulary.length}<a class="small" href="#/words">All words</a>{/if}
      {#if editing !== 'new'}
        <button type="button" class="btn ghost small" onclick={() => (editing = 'new')}><Icon name="plus" size={16} /> Add a word</button>
      {/if}
    </div>
  </div>

  {#if editing === 'new'}
    <WordForm {item} onclose={() => (editing = null)} />
  {/if}

  {#if words.length}
    <ol class="words">
      {#each words as w (w.id)}
        <li>
          {#if editing === w.id}
            <WordForm {item} word={w} onclose={() => (editing = null)} />
          {:else}
            <WordEntry word={w}>
              {#snippet actions()}
                <button type="button" class="btn ghost icon small" aria-label="Edit “{w.word}”" onclick={() => (editing = w.id)}>
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" class="btn ghost icon small" aria-label="Remove “{w.word}”" onclick={() => remove(w)}>
                  <Icon name="trash" size={16} />
                </button>
              {/snippet}
            </WordEntry>
          {/if}
        </li>
      {/each}
    </ol>
  {:else if editing !== 'new'}
    <p class="muted small">No words yet. Add new words you meet in this {item.type === 'fic' ? 'fic' : 'book'} to look up and remember them.</p>
  {/if}
</section>

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.4rem;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
  }

  .words {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .words > li {
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .words > li:last-child {
    border-bottom: none;
  }
</style>
