<script lang="ts">
  import { characterForTag, characterHref } from '../../lib/characters';
  import { renderMarkdown } from '../../lib/markdown';
  import { percentOf, type TocEntry } from '../../lib/reader';
  import { byDate, formatDuration } from '../../lib/readingTime';
  import { seriesOf } from '../../lib/series';
  import { library } from '../../lib/store.svelte';
  import type { Character, Item, Quote, VocabWord } from '../../lib/types';
  import { today } from '../../lib/util';
  import Cover from '../Cover.svelte';
  import CharacterAvatar from '../characters/CharacterAvatar.svelte';

  // The book's details beside the text on wide screens: the book, where you are, its contents,
  // its characters, what you saved from it and your notes. In the reader's own colours.
  // `part`: everything (details on the right), or the left or right side (details on both sides).
  let {
    item,
    fileId,
    part,
    percent,
    chapter = undefined,
    leftInChapter = undefined,
    leftInBook = undefined,
    toc,
    current = undefined,
    ongo,
    onword,
    onallquotes,
  }: {
    item: Item;
    fileId: string;
    part: 'all' | 'left' | 'right';
    percent: number;
    chapter?: string;
    leftInChapter?: number;
    leftInBook?: number;
    toc: TocEntry[];
    current?: string;
    ongo: (target: string) => void;
    onword: (w: VocabWord) => void;
    onallquotes: () => void;
  } = $props();

  const QUOTES_SHOWN = 4;
  const WORDS_SHOWN = 24;
  const CHARACTERS_SHOWN = 10;

  const authors = $derived(library.authorNames(item));
  const series = $derived(
    seriesOf(item)
      .map((s) => [library.name('series', s.id), s.number ? `#${s.number}` : ''].filter(Boolean).join(' '))
      .filter(Boolean),
  );

  // Today's reading (what's been saved so far: the reader saves about once a minute).
  const goal = $derived(library.settings.dailyGoalMinutes ?? 0);
  const todayMin = $derived(Math.floor((byDate(library.readingTime).get(today()) ?? 0) / 60));

  // Characters: added to the book, or a fic's character tags (with their page, if there is one).
  const characters = $derived.by(() => {
    const out: { key: string; name: string; character?: Character; href: string; note?: string }[] = [];
    for (const id of item.characterIds ?? []) {
      const c = library.character(id);
      if (c) out.push({ key: c.id, name: c.name, character: c, href: characterHref(c), note: c.note });
    }
    for (const tag of item.fic?.characters ?? []) {
      const c = characterForTag(library.characters, tag);
      if (c && out.some((o) => o.key === c.id)) continue;
      out.push({ key: c?.id ?? `tag:${tag}`, name: c?.name ?? tag, character: c, href: characterHref(c, tag), note: c?.note });
    }
    return out;
  });
  const firstLine = (note?: string) => note?.split('\n').find((l) => l.trim())?.replace(/[*_#>`|]/g, '').trim();

  const quotes = $derived([...library.quotesFor(item.id)].reverse());
  const words = $derived([...library.wordsFor(item.id)].reverse());
  const canGo = (q: Quote) => q.fileId === fileId && !!q.cfi;

  // Keep the current chapter in view in the contents list (scrolling the list, not the panel).
  let list: HTMLOListElement | undefined = $state();
  $effect(() => {
    void current;
    const on = list?.querySelector<HTMLElement>('.on');
    if (!list || !on) return;
    const top = on.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + on.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 3);
    }
  });
</script>

{#snippet book()}
  <div class="book">
    <Cover {item} width={part === 'all' ? 120 : 100} />
    <div class="who">
      <h2>{item.title}</h2>
      {#if authors}<p class="by">{authors}</p>{/if}
      {#each series as s (s)}<p class="ser">{s}</p>{/each}
    </div>
  </div>
{/snippet}

{#snippet progress()}
  <section aria-label="Progress">
    <h3>Progress</h3>
    <div class="bar" role="img" aria-label="{percent}% read"><i style:width="{percent}%"></i></div>
    <p class="big">{percent}%{chapter ? ` · ${chapter}` : ''}</p>
    <p class="meta">
      {#if leftInChapter !== undefined || leftInBook !== undefined}
        {[
          leftInChapter !== undefined ? `About ${formatDuration(leftInChapter)} left in this chapter` : '',
          leftInBook !== undefined ? `${formatDuration(leftInBook)} in the book` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      {:else}
        Time left shows once your reading speed is known.
      {/if}
    </p>
    <p class="meta">Today: {goal ? `${todayMin} of ${goal} minutes` : `${todayMin} min`}</p>
  </section>
{/snippet}

{#snippet contents()}
  <section aria-label="Contents">
    <h3>Contents</h3>
    {#if toc.length}
      <ol class="toc" bind:this={list}>
        {#each toc as t, i (i)}
          <li>
            <button
              type="button"
              class:on={t.href === current}
              aria-current={t.href === current ? 'location' : undefined}
              style:padding-left="{0.5 + t.depth * 0.9}rem"
              onclick={() => ongo(t.href)}
            >
              <span class="entry">{t.label}</span>
              {#if t.fraction !== undefined}<span class="pct">{percentOf(t.fraction)}%</span>{/if}
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="meta">This book has no table of contents.</p>
    {/if}
  </section>
{/snippet}

{#snippet people()}
  {#if characters.length}
    <section aria-label="Characters">
      <h3>Characters</h3>
      <ul class="chars">
        {#each characters.slice(0, CHARACTERS_SHOWN) as c (c.key)}
          <li>
            <a href={c.href}>
              <CharacterAvatar character={c.character} name={c.name} size={34} />
              <span class="cname">{c.name}{#if firstLine(c.note)}<small>{firstLine(c.note)}</small>{/if}</span>
            </a>
          </li>
        {/each}
      </ul>
      {#if characters.length > CHARACTERS_SHOWN}<p class="meta">and {characters.length - CHARACTERS_SHOWN} more</p>{/if}
    </section>
  {/if}
{/snippet}

{#snippet saved()}
  {#if quotes.length || words.length}
    <section aria-label="Saved from this book">
      <h3>Saved from this book</h3>
      {#each quotes.slice(0, QUOTES_SHOWN) as q (q.id)}
        {#if canGo(q)}
          <button type="button" class="quote" onclick={() => ongo(q.cfi!)}>
            <span class="qt">{q.text.length > 220 ? q.text.slice(0, 220) + '…' : q.text}</span>
            {#if q.location}<small>{q.location}</small>{/if}
          </button>
        {:else}
          <div class="quote">
            <span class="qt">{q.text.length > 220 ? q.text.slice(0, 220) + '…' : q.text}</span>
            {#if q.location}<small>{q.location}</small>{/if}
          </div>
        {/if}
      {/each}
      {#if quotes.length > QUOTES_SHOWN}
        <button type="button" class="more" onclick={onallquotes}>All {quotes.length} quotes</button>
      {/if}
      {#if words.length}
        <div class="words">
          {#each words.slice(0, WORDS_SHOWN) as w (w.id)}<button type="button" onclick={() => onword(w)}>{w.word}</button>{/each}
          {#if words.length > WORDS_SHOWN}<span class="meta">+{words.length - WORDS_SHOWN} more</span>{/if}
        </div>
      {/if}
    </section>
  {/if}
{/snippet}

{#snippet notes()}
  {#if item.notes}
    <section aria-label="Your notes">
      <h3>Your notes</h3>
      <div class="prose note">{@html renderMarkdown(item.notes)}</div>
    </section>
  {/if}
{/snippet}

<div class="details {part}">
  {#if part === 'all'}
    {@render book()}
    <div class="two">
      <div>{@render progress()}{@render contents()}</div>
      <div>{@render people()}{@render saved()}{@render notes()}</div>
    </div>
  {:else if part === 'left'}
    {@render book()}
    {@render progress()}
    {@render notes()}
  {:else}
    {@render contents()}
    {@render people()}
    {@render saved()}
  {/if}
</div>

<style>
  .details {
    --line: color-mix(in srgb, var(--rfg) 13%, transparent);
    --soft: color-mix(in srgb, var(--rfg) 62%, var(--rbg));
    --hover: color-mix(in srgb, var(--rfg) 7%, var(--rbg));
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 2.2rem 2.4rem;
    background: color-mix(in srgb, var(--rfg) 3.5%, var(--rbg));
    color: var(--rfg);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  /* Each side's details stay a readable width, in the middle of the side. */
  .details > :global(*) {
    max-width: 30rem;
    margin-inline: auto;
  }

  .details.all {
    padding: 2.4rem 3rem;
  }

  .details.all > :global(*) {
    max-width: 62rem;
    margin-inline: 0;
  }

  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 2.6rem;
    margin-top: 1.4rem;
  }

  .left .book + section {
    margin-top: 1.3rem;
  }

  section {
    padding: 1.1rem 0;
    border-top: 1px solid var(--line);
  }

  .right > section:first-child {
    border-top: 0;
    padding-top: 0;
  }

  h3 {
    margin: 0 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--soft);
  }

  .book {
    display: flex;
    gap: 1.1rem;
    align-items: flex-start;
  }

  .book :global(.cover) {
    flex-shrink: 0;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
  }

  .who {
    min-width: 0;
  }

  h2 {
    margin: 0.1rem 0 0.3rem;
    font-family: var(--font-serif);
    font-size: 1.5rem;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .by {
    margin: 0;
    font-size: 0.95rem;
  }

  .ser {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--soft);
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
    margin: 0.15rem 0 0.55rem;
  }

  .bar i {
    display: block;
    height: 100%;
    background: var(--rfg);
    opacity: 0.75;
  }

  .big {
    margin: 0 0 0.2rem;
    font-size: 1.02rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    margin: 0.15rem 0;
    font-size: 0.85rem;
    color: var(--soft);
  }

  .toc {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(26rem, 46vh);
    overflow-y: auto;
  }

  .toc button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.32rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .toc button:hover {
    background: var(--hover);
  }

  .toc button.on {
    background: color-mix(in srgb, var(--rfg) 9%, var(--rbg));
    font-weight: 600;
  }

  .entry {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .pct {
    flex-shrink: 0;
    color: var(--soft);
    font-variant-numeric: tabular-nums;
  }

  .chars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chars a {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: inherit;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .chars a:hover .cname {
    text-decoration: underline;
  }

  .cname {
    min-width: 0;
  }

  .cname small {
    display: block;
    color: var(--soft);
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quote {
    display: block;
    width: 100%;
    margin: 0 0 0.7rem;
    padding: 0 0 0 0.7rem;
    border: 0;
    border-left: 3px solid var(--line);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  button.quote {
    cursor: pointer;
  }

  button.quote:hover .qt {
    text-decoration: underline;
    text-decoration-color: var(--line);
  }

  .qt {
    display: block;
    font-family: var(--font-serif);
    font-size: 0.95rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .quote small {
    display: block;
    margin-top: 0.2rem;
    color: var(--soft);
    font-size: 0.75rem;
  }

  .more {
    margin: 0 0 0.8rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .words {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .words button {
    padding: 0.2rem 0.65rem;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, #9fe2bf 45%, var(--rbg));
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .note {
    font-size: 0.9rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .note :global(a) {
    color: inherit;
  }

  .note :global(blockquote) {
    color: var(--soft);
    border-left-color: var(--line);
  }
</style>
