<script lang="ts">
  import type { Snippet } from 'svelte';
  import { pronounce } from '../../lib/dictionary';
  import type { VocabWord } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // One learned word: the word, how it sounds, what it means.
  let { word, actions, extra }: { word: VocabWord; actions?: Snippet; extra?: Snippet } = $props();

  const canSpeak = typeof speechSynthesis !== 'undefined';
  const prons = $derived(word.pronunciations ?? []);
</script>

<article class="entry" lang={word.language}>
  <div class="top">
    <div class="head">
      <strong class="word">{word.word}</strong>
      {#each prons as p, i (i)}
        <span class="pron">
          {#if p.accent}<span class="accent">{p.accent}</span>{/if}
          {#if p.ipa}<span class="ipa" lang="en-fonipa">{p.ipa}</span>{/if}
          {#if p.audio}
            <button
              type="button"
              class="btn ghost icon small"
              aria-label="Play pronunciation{p.accent ? ` (${p.accent})` : ''}"
              onclick={() => pronounce(word.word, word.language, p.audio)}
            >
              <Icon name="speaker" size={16} />
            </button>
          {/if}
        </span>
      {/each}
      {#if !prons.some((p) => p.audio) && canSpeak}
        <button
          type="button"
          class="btn ghost icon small"
          aria-label="Say “{word.word}”"
          title="Read aloud with your device’s voice"
          onclick={() => pronounce(word.word, word.language)}
        >
          <Icon name="speaker" size={16} />
        </button>
      {/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if word.senses.length}
    <ol class="senses" class:single={word.senses.length === 1} lang="en">
      {#each word.senses as s, i (i)}
        <li>
          {#if s.pos}<span class="pos">{s.pos}</span>{/if}
          <span>{s.text}</span>
          {#if s.example}<div class="example small muted">“{s.example}”</div>{/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if word.note}<p class="note small">{word.note}</p>{/if}
  {#if extra}{@render extra()}{/if}
</article>

<style>
  .entry {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .top {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .head {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.1rem 0.6rem;
  }

  .word {
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  .pron {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--text-2);
    font-size: 0.9rem;
  }

  .accent {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .actions {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .senses {
    margin: 0;
    padding-left: 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow-wrap: anywhere;
  }

  .senses.single {
    list-style: none;
    padding-left: 0;
  }

  .pos {
    font-style: italic;
    color: var(--text-2);
    margin-right: 0.35em;
  }

  .note {
    margin: 0;
    font-style: italic;
    color: var(--text-2);
    border-left: 3px solid var(--border);
    padding-left: 0.6rem;
    overflow-wrap: anywhere;
  }
</style>
