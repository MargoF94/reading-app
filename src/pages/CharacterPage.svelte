<script lang="ts">
  import CharacterAvatar from '../components/characters/CharacterAvatar.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import PictureGallery from '../components/images/PictureGallery.svelte';
  import { appearances, charKey, characterForTag, splitNames, tagName } from '../lib/characters';
  import { STATUS_LABEL } from '../lib/constants';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Character, ItemImage } from '../lib/types';
  import { collator } from '../lib/util';

  // A character: pictures, a note, and the books and fics they're in.
  // Characters only known from fic tags (?tag=…) get a page record once you add something.
  let { id = undefined, tag = undefined }: { id?: string; tag?: string } = $props();

  const record = $derived(id ? library.character(id) : tag ? characterForTag(library.characters, tag) : undefined);
  const name = $derived(record?.name ?? (tag ? tagName(tag) : ''));
  const entry = $derived(
    library.characterIndex.find((e) => (record ? e.character?.id === record.id : e.key === charKey(tag ?? ''))),
  );
  const items = $derived(
    [...(entry?.items ?? [])].sort((a, b) => (a.type === b.type ? collator.compare(a.title, b.title) : a.type === 'book' ? -1 : 1)),
  );

  // A tag link for a character that now has a page goes to that page.
  $effect(() => {
    if (!id && record) router.go(`/character/${record.id}`, true);
  });

  let editing = $state(false);
  let fName = $state('');
  let fAlt = $state('');
  let fNote = $state('');

  function startEdit() {
    fName = record?.name ?? name;
    fAlt = (record?.altNames ?? []).join(', ');
    fNote = record?.note ?? '';
    editing = true;
  }

  /** The record, created from the tag the first time something is saved. */
  async function ensure(): Promise<Character> {
    return library.character(record?.id ?? '') ?? (await library.createCharacter(name));
  }

  async function saveEdit(e: Event) {
    e.preventDefault();
    if (!fName.trim()) return;
    const c = await ensure();
    await library.saveCharacter({ ...c, name: fName.trim(), altNames: splitNames(fAlt).filter((n) => n !== fName.trim()), note: fNote.trim() || undefined });
    editing = false;
    if (!id) router.go(`/character/${c.id}`, true);
  }

  async function remove() {
    if (!record || !confirm(`Delete ${record.name}’s page and pictures? Books stop listing them; fic tags stay.`)) return;
    await library.deleteCharacter(record);
    toasts.show('Character deleted.');
    router.back('/browse/characters');
  }

  async function saveImages(images: ItemImage[]) {
    const c = await ensure();
    await library.saveCharacter({ ...library.character(c.id)!, images });
    if (!id) router.go(`/character/${c.id}`, true);
  }

  async function setMain(imageId: string) {
    if (!record) return;
    await library.saveCharacter({ ...record, mainImageId: imageId });
  }

  function statusText(itemId: string): string {
    const s = library.status(itemId);
    const it = library.item(itemId);
    return s === 'read' && it?.rating ? `${STATUS_LABEL[s]} · ${it.rating}★` : STATUS_LABEL[s];
  }
</script>

{#if !name}
  <div class="empty">
    <h1>Not found</h1>
    <p>This character was deleted. <a href="#/browse/characters">All characters</a></p>
  </div>
{:else}
  <div class="top row">
    <button type="button" class="btn ghost small" onclick={() => router.back('/browse/characters')}><Icon name="back" size={18} /> Back</button>
    {#if !editing}<button type="button" class="btn small" onclick={startEdit}><Icon name="edit" size={16} /> Edit</button>{/if}
  </div>

  {#if editing}
    <form class="card stack edit" onsubmit={saveEdit}>
      <label class="field"><span>Name</span><input bind:value={fName} required autocomplete="off" /></label>
      <label class="field">
        <span>Other names <span class="muted">(comma-separated; fic tags with these names count too)</span></span>
        <input bind:value={fAlt} autocomplete="off" placeholder="e.g. Matthew Rose Sorensen, ピラネージ" />
      </label>
      <label class="field"><span>Note</span><textarea bind:value={fNote} rows="3"></textarea></label>
      <div class="row buttons">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn ghost" onclick={() => (editing = false)}>Cancel</button>
        {#if record}<button type="button" class="btn ghost danger" onclick={remove}>Delete character</button>{/if}
      </div>
    </form>
  {:else}
    <header class="hero">
      <CharacterAvatar character={record} {name} size={96} />
      <div class="who">
        <h1>{name}</h1>
        {#if record?.altNames.length}<p class="muted alt">also: {record.altNames.join(' · ')}</p>{/if}
        <p class="small">In {appearances(entry?.books ?? 0, entry?.fics ?? 0).replace(' · ', ' and ')}</p>
      </div>
    </header>
    {#if record?.note}<p class="note">{record.note}</p>{/if}
  {/if}

  <PictureGallery
    images={record?.images ?? []}
    ownerId={record ? `char-${record.id}` : 'char'}
    title={name}
    empty="Add pictures of {name}: upload them or add a link. The main picture is used as their avatar."
    latest={() => library.character(record?.id ?? '')?.images ?? []}
    onsave={saveImages}
    mainId={record?.mainImageId}
    onsetmain={setMain}
  />

  <section class="featured">
    <div class="row head"><h2>Featured in</h2><span class="muted small">{items.length}</span></div>
    {#if items.length}
      <ul>
        {#each items as it (it.id)}
          <li>
            <a href="#/item/{it.id}">
              <Cover item={it} width={44} />
              <span class="body">
                <strong>{it.title}</strong>
                <span class="small muted">
                  {it.type === 'fic' ? `Fic · ${it.fic?.fandoms[0] ?? 'AO3'}` : `Book${library.authorNames(it) ? ` · ${library.authorNames(it)}` : ''}`}
                </span>
              </span>
              <span class="small muted status">{statusText(it.id)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">Not in any book or fic yet. Add {name} from a book’s page (Characters → Add).</p>
    {/if}
  </section>
{/if}

<style>
  .top {
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .who {
    min-width: 0;
  }

  .who h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .who p {
    margin: 0.15rem 0 0;
  }

  .alt {
    overflow-wrap: anywhere;
  }

  .note {
    color: var(--text-2);
    white-space: pre-wrap;
    margin: 0.9rem 0 0;
    max-width: 640px;
  }

  .edit {
    gap: 0.7rem;
    max-width: 640px;
  }

  .buttons {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .danger {
    color: var(--danger);
  }

  :global(.edit) + :global(section),
  .hero + :global(section),
  .note + :global(section) {
    margin-top: 1.4rem;
  }

  .featured {
    margin-top: 1.6rem;
  }

  .featured .head {
    justify-content: space-between;
  }

  .featured h2 {
    margin: 0;
  }

  .featured ul {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
    max-width: 760px;
  }

  .featured a {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }

  .status {
    text-align: right;
    flex-shrink: 0;
    max-width: 40%;
  }
</style>
