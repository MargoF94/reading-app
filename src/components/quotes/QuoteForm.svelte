<script lang="ts">
  import { library } from '../../lib/store.svelte';
  import type { Item, Quote } from '../../lib/types';
  import { newId, nowIso } from '../../lib/util';

  // Add (or edit) a quote from a book or fic.
  // `initial` pre-fills a new quote, e.g. text selected in the reader and where it is.
  let {
    item,
    quote = undefined,
    initial = undefined,
    onclose,
    onsaved = undefined,
  }: {
    item: Item;
    quote?: Quote;
    initial?: Pick<Quote, 'text' | 'location' | 'fileId' | 'cfi'>;
    onclose: () => void;
    onsaved?: (q: Quote) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const editing = quote;
  // svelte-ignore state_referenced_locally
  const start = initial;
  let text = $state(editing?.text ?? start?.text ?? '');
  let location = $state(editing?.location ?? start?.location ?? '');
  let note = $state(editing?.note ?? '');
  let error = $state('');
  let saving = $state(false);

  const placeholder = $derived(
    item.type === 'fic'
      ? 'e.g. ch. 12'
      : item.book?.format === 'ebook'
        ? 'e.g. p. 42 or loc. 1234'
        : item.book?.format === 'audiobook'
          ? 'e.g. ch. 3 or 2:14:05'
          : 'e.g. p. 42',
  );

  async function save(e: Event) {
    e.preventDefault();
    // Trim spaces around, and stray quote marks when the whole passage was pasted in them.
    const t = text.trim().replace(/^[“"「『](.*)[”"」』]$/s, '$1').trim();
    if (!t) return (error = 'Write or paste the quote first.');
    saving = true;
    try {
      const now = nowIso();
      const record: Quote = {
        id: editing?.id ?? newId(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        itemId: item.id,
        text: t,
        location: location.trim() || undefined,
        note: note.trim() || undefined,
        fileId: editing?.fileId ?? start?.fileId,
        cfi: editing?.cfi ?? start?.cfi,
      };
      await library.saveQuote(record);
      onsaved?.(record);
      onclose();
    } finally {
      saving = false;
    }
  }
</script>

<form class="quote-form stack" onsubmit={save}>
  <label class="field">
    <span>Quote</span>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea bind:value={text} rows="4" autofocus={!editing && !start} lang={item.language} placeholder="Type or paste the passage"></textarea>
  </label>
  <label class="field">
    <span>Where <span class="muted">(optional — page, chapter, location)</span></span>
    <input bind:value={location} autocomplete="off" {placeholder} />
  </label>
  <label class="field">
    <span>Your note <span class="muted">(optional)</span></span>
    <textarea bind:value={note} rows="2" placeholder="Why it stayed with you"></textarea>
  </label>

  {#if error}<p class="error small" role="alert" style="margin:0">{error}</p>{/if}

  <div class="row buttons">
    <button type="submit" class="btn primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save quote'}</button>
    <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
  </div>
</form>

<style>
  .quote-form {
    gap: 0.7rem;
    padding: 0.8rem 0;
  }

  .buttons {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error {
    color: var(--danger);
  }
</style>
