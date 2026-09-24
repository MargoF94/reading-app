<script lang="ts">
  import {
    appleMusicSearchUrl,
    confidentMatch,
    isAppleMusicUrl,
    musicStore,
    searchAppleMusic,
    type AppleTrack,
  } from '../lib/appleMusic';
  import { library } from '../lib/store.svelte';
  import type { Item, Song } from '../lib/types';
  import { newId, songUrl } from '../lib/util';
  import Icon from './Icon.svelte';

  // Songs the reader associates with a book or fic, saved straight to the item.
  // Songs are linked to Apple Music so a tap opens (and plays) them in the Music app.
  let { item }: { item: Item } = $props();

  const songs = $derived(item.songs ?? []);
  const store = $derived(musicStore(library.settings));

  let editing = $state<string | null>(null); // song id, or 'new'
  let title = $state('');
  let artist = $state('');
  let url = $state('');
  let artwork = $state<string | undefined>();
  let note = $state('');
  let error = $state('');
  let saving = $state(false);

  // Apple Music search in the form.
  let searching = $state(false);
  let results = $state<AppleTrack[] | null>(null);
  let searchError = $state('');

  function open(song?: Song) {
    editing = song?.id ?? 'new';
    title = song?.title ?? '';
    artist = song?.artist ?? '';
    url = song?.url ?? '';
    artwork = song?.artwork;
    note = song?.note ?? '';
    error = searchError = '';
    results = null;
    queueMicrotask(() => document.getElementById('song-title')?.focus());
  }

  async function find() {
    if (!title.trim()) return (error = 'Enter the song’s name first.');
    error = searchError = '';
    searching = true;
    try {
      results = await searchAppleMusic(title.trim(), artist.trim() || undefined, store);
      if (!results.length) searchError = 'No songs found on Apple Music. Try fewer words, or check the artist’s name.';
    } catch {
      results = null;
      searchError = 'Couldn’t reach Apple Music. You can open its search below and paste the song’s link.';
    } finally {
      searching = false;
    }
  }

  function choose(t: AppleTrack) {
    url = t.url;
    artwork = t.artwork;
    if (!artist.trim()) artist = t.artist;
    results = null;
  }

  /** A song saved without a link gets the Apple Music song it clearly matches. */
  async function autoLink(t: string, a: string | undefined): Promise<AppleTrack | undefined> {
    if (!navigator.onLine) return undefined;
    try {
      const found = await Promise.race([
        searchAppleMusic(t, a, store),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      return confidentMatch(found, t, a);
    } catch {
      return undefined;
    }
  }

  async function save(e: Event) {
    e.preventDefault();
    if (!title.trim()) return (error = 'Enter the song’s name.');
    let link = url.trim() ? songUrl(url) : undefined;
    if (url.trim() && !link) return (error = 'The link should be a web address, e.g. https://music.apple.com/…');
    saving = true;
    try {
      let art = isAppleMusicUrl(link) ? artwork : undefined;
      let who = artist.trim() || undefined;
      if (!link) {
        const match = await autoLink(title.trim(), who);
        if (match) {
          link = match.url;
          art = match.artwork;
          who ??= match.artist;
        }
      }
      const song: Song = {
        id: editing === 'new' || !editing ? newId() : editing,
        title: title.trim(),
        artist: who,
        url: link,
        artwork: art,
        note: note.trim() || undefined,
      };
      const next = editing === 'new' ? [...songs, song] : songs.map((s) => (s.id === song.id ? song : s));
      await library.saveItem({ ...item, songs: next });
      editing = null;
    } finally {
      saving = false;
    }
  }

  async function remove(song: Song) {
    if (!confirm(`Remove “${song.title}”?`)) return;
    const next = songs.filter((s) => s.id !== song.id);
    await library.saveItem({ ...item, songs: next.length ? next : undefined });
    if (editing === song.id) editing = null;
  }
</script>

{#snippet form()}
  <form class="song-form stack" onsubmit={save}>
    <div class="grid">
      <label>
        <span class="label">Song</span>
        <input id="song-title" bind:value={title} autocomplete="off" />
      </label>
      <label>
        <span class="label">Artist <span class="muted">(optional)</span></span>
        <input bind:value={artist} autocomplete="off" />
      </label>
    </div>

    <div class="apple stack">
      {#if isAppleMusicUrl(url)}
        <p class="linked small">
          <Icon name="music" size={16} />
          <span>Linked to Apple Music</span>
          <button type="button" class="btn ghost small" onclick={() => ((url = ''), (artwork = undefined))}>Unlink</button>
          <button type="button" class="btn ghost small" disabled={searching} onclick={find}>Choose another</button>
        </p>
      {:else}
        <div>
          <button type="button" class="btn small" disabled={searching} onclick={find}>
            <Icon name="music" size={16} /> {searching ? 'Searching…' : 'Find on Apple Music'}
          </button>
        </div>
      {/if}
      {#if results?.length}
        <ul class="results" aria-label="Apple Music results">
          {#each results as r (r.id)}
            <li>
              <button type="button" class="result" onclick={() => choose(r)}>
                {#if r.artwork}<img src={r.artwork} alt="" width="44" height="44" loading="lazy" />{:else}<span class="art"></span>{/if}
                <span class="meta">
                  <span class="r-title">{r.title}</span>
                  <span class="small muted">{r.artist}{r.album ? ` · ${r.album}` : ''}</span>
                </span>
                <span class="use small">Use</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if searchError}
        <p class="small muted" role="status" style="margin:0">
          {searchError}
          <a href={appleMusicSearchUrl(title, artist, store)} target="_blank" rel="noopener noreferrer">Search Apple Music ↗</a>
        </p>
      {/if}
    </div>

    <label>
      <span class="label">Link <span class="muted">(optional — filled in from Apple Music, or paste YouTube, Spotify…)</span></span>
      <input bind:value={url} inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://" />
    </label>
    <label>
      <span class="label">Note <span class="muted">(optional — a character, a scene…)</span></span>
      <input bind:value={note} autocomplete="off" />
    </label>
    {#if error}<p class="error small" role="alert">{error}</p>{/if}
    <div class="row">
      <button type="submit" class="btn primary small" disabled={saving}>
        {saving ? 'Saving…' : editing === 'new' ? 'Add song' : 'Save'}
      </button>
      <button type="button" class="btn small" onclick={() => (editing = null)}>Cancel</button>
    </div>
  </form>
{/snippet}

<section>
  <div class="row head">
    <h2>Songs</h2>
    {#if editing !== 'new'}
      <button type="button" class="btn ghost small" onclick={() => open()}><Icon name="plus" size={16} /> Add a song</button>
    {/if}
  </div>
  {#if songs.length}
    <ol class="songs">
      {#each songs as s (s.id)}
        {#if editing === s.id}
          <li>{@render form()}</li>
        {:else}
          <li class="song">
            {#if s.artwork}<img class="thumb" src={s.artwork} alt="" width="44" height="44" loading="lazy" />{/if}
            <div class="text">
              <div class="title">{s.title}</div>
              {#if s.artist}<div class="small">{s.artist}</div>{/if}
              {#if s.note}<div class="small muted note">{s.note}</div>{/if}
            </div>
            <div class="actions">
              {#if isAppleMusicUrl(s.url)}
                <a class="btn small play" href={s.url} target="_blank" rel="noopener noreferrer" aria-label="Play “{s.title}” in Apple Music">
                  <Icon name="play" size={16} /> Play
                </a>
              {:else if s.url}
                <a class="btn ghost small" href={s.url} target="_blank" rel="noopener noreferrer">Listen <Icon name="external" size={14} /></a>
              {:else}
                <a
                  class="btn ghost small"
                  href={appleMusicSearchUrl(s.title, s.artist, store)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Find “{s.title}” on Apple Music"
                >
                  <Icon name="search" size={15} /> Apple Music
                </a>
              {/if}
              <button type="button" class="btn ghost icon small" aria-label="Edit “{s.title}”" onclick={() => open(s)}>
                <Icon name="edit" size={16} />
              </button>
              <button type="button" class="btn ghost icon small" aria-label="Remove “{s.title}”" onclick={() => remove(s)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
        {/if}
      {/each}
    </ol>
  {:else if editing !== 'new'}
    <p class="muted small">No songs yet. Add ones that remind you of this {item.type === 'fic' ? 'fic' : 'book'}.</p>
  {/if}
  {#if editing === 'new'}{@render form()}{/if}
</section>

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  h2 {
    margin: 0;
  }

  .songs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
  }

  .song {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }

  .song:last-child {
    border-bottom: none;
  }

  .thumb,
  .result img,
  .art {
    width: 44px;
    height: 44px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--surface-2);
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .title {
    font-weight: 600;
  }

  .note {
    font-style: italic;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .play {
    gap: 0.3rem;
  }

  .song-form {
    padding: 0.75rem 0;
    gap: 0.6rem;
  }

  .song-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 560px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .apple {
    gap: 0.5rem;
  }

  .linked {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.3rem 0.5rem;
    margin: 0;
    color: var(--accent);
  }

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    max-height: 320px;
    overflow-y: auto;
  }

  .results li + li {
    border-top: 1px solid var(--border);
  }

  .result {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .result:hover,
  .result:focus-visible {
    background: var(--surface-2);
  }

  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }

  .r-title {
    font-weight: 600;
  }

  .use {
    color: var(--accent);
    flex-shrink: 0;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
