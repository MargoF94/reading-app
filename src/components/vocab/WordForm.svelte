<script lang="ts">
  import { LANGUAGE_NAME, LANGUAGES, PINNED_LANGUAGES } from '../../lib/constants';
  import { lookupWord, pronounce, sensesText, type LookupResult } from '../../lib/dictionary';
  import { library } from '../../lib/store.svelte';
  import type { Item, VocabWord, WordSense } from '../../lib/types';
  import { newId, normalize, nowIso } from '../../lib/util';
  import { onMount } from 'svelte';
  import Icon from '../Icon.svelte';

  // Add (or edit) a learned word: type it, look it up, then keep the dictionary's
  // meaning or write your own.
  // `initial` pre-fills a new word (e.g. one selected in the reader) and looks it up straight away.
  let {
    item,
    word = undefined,
    initial = undefined,
    onclose,
    onsaved = undefined,
  }: {
    item: Item;
    word?: VocabWord;
    initial?: { word: string; note?: string; language?: string };
    onclose: () => void;
    onsaved?: (w: VocabWord) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  const editing = word;
  // svelte-ignore state_referenced_locally
  const start = initial;
  let text = $state(editing?.word ?? start?.word ?? '');
  // svelte-ignore state_referenced_locally
  let lang = $state(editing?.language ?? start?.language ?? item.language ?? 'en');
  let note = $state(editing?.note ?? start?.note ?? '');

  type Status = 'idle' | 'loading' | 'found' | 'notfound' | 'error';
  let status = $state<Status>(editing && !editing.manual ? 'found' : 'idle');
  let result = $state<LookupResult | null>(
    editing && !editing.manual
      ? {
          word: editing.word,
          senses: editing.senses,
          pronunciations: editing.pronunciations ?? [],
          source: editing.source ?? '',
          sourceUrl: editing.sourceUrl ?? '',
        }
      : null,
  );
  let looked = $state(editing ? `${editing.word}|${editing.language}` : ''); // word|lang last looked up
  let selected = $state<boolean[]>(editing && !editing.manual ? editing.senses.map(() => true) : []);
  let manual = $state(!!editing?.manual);
  let manualText = $state(editing?.manual ? sensesText(editing.senses) : '');
  let error = $state('');
  let saving = $state(false);
  let ctrl: AbortController | null = null;

  const key = $derived(`${text.trim()}|${lang}`);
  const stale = $derived(!!text.trim() && key !== looked);
  const selectedSenses = $derived(result?.senses.filter((_, i) => selected[i]) ?? []);

  async function lookup() {
    const w = text.trim();
    if (!w) return (error = 'Type the word first.');
    error = '';
    ctrl?.abort();
    ctrl = new AbortController();
    status = 'loading';
    looked = key;
    try {
      result = await lookupWord(w, lang, ctrl.signal);
      if (result) {
        status = 'found';
        selected = result.senses.map((_, i) => i === 0);
        manual = false;
      } else {
        status = 'notfound';
        manual = true;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      result = null;
      status = 'error';
      manual = true;
    }
  }

  async function quietPronunciation(w: string) {
    try {
      const hit = await Promise.race([
        lookupWord(w, 'en'),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
      return hit?.pronunciations.length ? hit.pronunciations : undefined;
    } catch {
      return undefined;
    }
  }

  /** "(noun) text" lines back into senses. */
  function parseManual(t: string): WordSense[] {
    return t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^\(([^)]{1,30})\)\s*(.+)$/);
        return m ? { pos: m[1], text: m[2] } : { text: l };
      });
  }

  async function save() {
    const w = text.trim();
    if (!w) return (error = 'Type the word first.');
    const senses = manual ? parseManual(manualText) : $state.snapshot(selectedSenses);
    if (!senses.length) return (error = manual ? 'Write the meaning, or pick one from the dictionary.' : 'Tick at least one meaning.');
    if (!editing) {
      const dup = library.wordsFor(item.id).find((x) => normalize(x.word) === normalize(w));
      if (dup && !confirm(`“${dup.word}” is already in this ${item.type}’s words. Add it again?`)) return;
    }
    saving = true;
    try {
      let prons = !stale && result?.pronunciations.length ? $state.snapshot(result.pronunciations) : undefined;
      // English words always get a pronunciation, even when the meaning is your own.
      if (!prons && !stale && editing?.pronunciations?.length) prons = editing.pronunciations;
      const known = !stale && (status === 'found' || status === 'notfound'); // already looked up
      if (!prons && lang === 'en' && !known) prons = await quietPronunciation(w);
      const now = nowIso();
      const fromDict = !stale && result;
      const record: VocabWord = {
        id: editing?.id ?? newId(),
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
        itemId: item.id,
        // "Book" typed at the start of a sentence is saved as the dictionary has it: "book".
        word: fromDict && result!.word !== w && result!.word === result!.word.toLowerCase() ? w.toLowerCase() : w,
        language: lang,
        senses,
        manual: manual || undefined,
        source: manual ? undefined : fromDict ? result!.source : editing?.source,
        sourceUrl: manual ? undefined : fromDict ? result!.sourceUrl : editing?.sourceUrl,
        pronunciations: prons,
        note: note.trim() || undefined,
      };
      await library.saveWord(record);
      onsaved?.(record);
      onclose();
    } finally {
      saving = false;
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    if (stale && !manual) void lookup();
    else void save();
  }

  $effect(() => () => ctrl?.abort());

  onMount(() => {
    if (start?.word) void lookup();
  });
</script>

<form class="word-form stack" onsubmit={submit}>
  <div class="row word-row">
    <label class="field grow">
      <span>Word</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={text} autocomplete="off" autocapitalize="off" spellcheck="false" autofocus={!editing && !start} lang={lang} />
    </label>
    <label class="field lang">
      <span>Language</span>
      <select bind:value={lang}>
        {#each LANGUAGES as l, i (l.code)}
          {#if i === PINNED_LANGUAGES}<option disabled>──────────</option>{/if}
          <option value={l.code}>{l.name}</option>
        {/each}
      </select>
    </label>
    <button type="button" class="btn" disabled={!text.trim() || status === 'loading'} onclick={lookup}>
      <Icon name="search" size={16} /> {status === 'loading' ? 'Looking up…' : 'Look up'}
    </button>
  </div>

  {#if status === 'found' && result && !stale}
    <section class="result stack" aria-live="polite">
      {#if result.pronunciations.length}
        <div class="prons">
          {#each result.pronunciations as p, i (i)}
            <span class="pron">
              {#if p.accent}<span class="accent">{p.accent}</span>{/if}
              {#if p.ipa}<span lang="en-fonipa">{p.ipa}</span>{/if}
              {#if p.audio}
                <button type="button" class="btn ghost icon small" aria-label="Play pronunciation" onclick={() => pronounce(result!.word, lang, p.audio)}>
                  <Icon name="speaker" size={16} />
                </button>
              {/if}
            </span>
          {/each}
        </div>
      {/if}
      {#if !manual}
        <fieldset>
          <legend class="small muted">
            Meanings from {result.source || 'the dictionary'} — tick the ones you want to keep
          </legend>
          <ul class="senses">
            {#each result.senses as s, i (i)}
              <li>
                <label>
                  <input type="checkbox" bind:checked={selected[i]} />
                  <span>
                    {#if s.pos}<em class="pos">{s.pos}</em>{/if}
                    {s.text}
                    {#if s.example}<span class="example small muted">“{s.example}”</span>{/if}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
        </fieldset>
        {#if result.sourceUrl}
          <a class="small" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">See the full entry ↗</a>
        {/if}
      {/if}
    </section>
  {:else if status === 'notfound' && !stale}
    <p class="small muted" role="status" style="margin:0">
      No entry for “{text.trim()}” in {lang === 'en' ? 'the English dictionaries' : `Wiktionary’s ${LANGUAGE_NAME[lang] ?? lang} words`}.
      Try its dictionary form (e.g. “run” rather than “ran”), or write the meaning yourself.
    </p>
  {:else if status === 'error' && !stale}
    <p class="small error" role="alert" style="margin:0">Couldn’t reach the dictionary. You can write the meaning yourself.</p>
  {/if}

  {#if manual}
    <label class="field">
      <span>Your meaning</span>
      <textarea bind:value={manualText} rows="3" placeholder="What it means — one meaning per line"></textarea>
    </label>
  {/if}

  <label class="field">
    <span>Note <span class="muted">(optional — the sentence it appeared in, page, …)</span></span>
    <input bind:value={note} autocomplete="off" />
  </label>

  {#if error}<p class="error small" role="alert" style="margin:0">{error}</p>{/if}

  <div class="row buttons">
    {#if stale && !manual}
      <button type="submit" class="btn primary" disabled={status === 'loading'}>Look up</button>
    {:else if manual}
      <button type="submit" class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save my meaning'}</button>
      {#if result && status === 'found' && !stale}
        <button type="button" class="btn" onclick={() => (manual = false)}>Use the dictionary’s meaning</button>
      {/if}
    {:else}
      <button type="submit" class="btn primary" disabled={saving || !selectedSenses.length}>
        {saving ? 'Saving…' : selectedSenses.length > 1 ? 'Use these meanings' : 'Use this meaning'}
      </button>
      <button
        type="button"
        class="btn"
        onclick={() => {
          manual = true;
          manualText ||= sensesText(selectedSenses);
        }}>Write my own meaning</button
      >
    {/if}
    <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
  </div>
</form>

<style>
  .word-form {
    gap: 0.7rem;
    padding: 0.8rem 0;
  }

  .word-row {
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .grow {
    flex: 1 1 180px;
    min-width: 0;
  }

  .lang {
    flex: 0 1 150px;
  }

  .result {
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.7rem 0.8rem;
  }

  .prons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.9rem;
  }

  .pron {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--text-2);
  }

  .accent {
    font-size: 0.7rem;
    font-weight: 700;
  }

  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.35rem;
  }

  .senses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 340px;
    overflow-y: auto;
  }

  .senses label {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .senses input {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
    accent-color: var(--accent);
  }

  .pos {
    color: var(--text-2);
    margin-right: 0.3em;
  }

  .example {
    display: block;
  }

  .buttons {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .error {
    color: var(--danger);
  }
</style>
