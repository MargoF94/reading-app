<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Quote } from '../../lib/types';

  // One saved quote: the passage, where it is, and the reader's note.
  let { quote, lang, actions, extra }: { quote: Quote; lang?: string; actions?: Snippet; extra?: Snippet } = $props();
</script>

<article class="entry">
  <div class="top">
    <blockquote {lang}>{quote.text}</blockquote>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if quote.location}<p class="where small muted">{quote.location}</p>{/if}
  {#if quote.note}<p class="note small">{quote.note}</p>{/if}
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
    gap: 0.5rem;
    align-items: flex-start;
  }

  blockquote {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding-left: 0.8rem;
    border-left: 3px solid var(--accent);
    font-family: var(--font-serif);
    font-size: 1.05rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-shrink: 0;
    margin-top: -0.2rem;
  }

  .where,
  .note {
    margin: 0;
    padding-left: calc(0.8rem + 3px);
  }

  .note {
    color: var(--text-2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
