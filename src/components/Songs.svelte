<script lang="ts">
  import { library } from '../lib/store.svelte';
  import type { Item, Song } from '../lib/types';
  import { newId, songUrl } from '../lib/util';
  import Icon from './Icon.svelte';

  // Songs the reader associates with a book or fic, saved straight to the item.
  let { item }: { item: Item } = $props();

  const songs = $derived(item.songs ?? []);

  let editing = $state<string | null>(null); // song id, or 'new'
  let title = $state('');
  let artist = $state('');
  let url = $state('');
  let note = $state('');
  let error = $state('');

  function open(song?: Song) {
    editing = song?.id ?? 'new';
    title = song?.title ?? '';
    artist = song?.artist ?? '';
    url = song?.url ?? '';
    note = song?.note ?? '';
    error = '';
    queueMicrotask(() => document.getElementById('song-title')?.focus());
  }

  async function save(e: Event) {
    e.preventDefault();
    if (!title.trim()) return (error = 'Enter the song’s name.');
    const link = url.trim() ? songUrl(url) : undefined;
    if (url.trim() && !link) return (error = 'The link should be a web address, e.g. https://youtu.be/…');
    const song: Song = {
      id: editing === 'new' || !editing ? newId() : editing,
      title: title.trim(),
      artist: artist.trim() || undefined,
      url: link,
      note: note.trim() || undefined,
    };
    const next = editing === 'new' ? [...songs, song] : songs.map((s) => (s.id === song.id ? song : s));
    await library.saveItem({ ...item, songs: next });
    editing = null;
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
    <label>
      <span class="label">Link <span class="muted">(optional — YouTube, Spotify…)</span></span>
      <input bind:value={url} inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://" />
    </label>
    <label>
      <span class="label">Note <span class="muted">(optional — a character, a scene…)</span></span>
      <input bind:value={note} autocomplete="off" />
    </label>
    {#if error}<p class="error small" role="alert">{error}</p>{/if}
    <div class="row">
      <button type="submit" class="btn primary small">{editing === 'new' ? 'Add song' : 'Save'}</button>
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
            <div class="text">
              <div class="title">{s.title}</div>
              {#if s.artist}<div class="small">{s.artist}</div>{/if}
              {#if s.note}<div class="small muted note">{s.note}</div>{/if}
            </div>
            <div class="actions">
              {#if s.url}
                <a class="btn ghost small" href={s.url} target="_blank" rel="noopener noreferrer">Listen <Icon name="external" size={14} /></a>
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
    gap: 0.5rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }

  .song:last-child {
    border-bottom: none;
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

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
