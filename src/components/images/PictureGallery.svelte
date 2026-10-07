<script lang="ts">
  import { discardCover, resizeImage, saveRepoImage } from '../../lib/covers';
  import { toasts } from '../../lib/toast.svelte';
  import type { ItemImage } from '../../lib/types';
  import { newId, nowIso } from '../../lib/util';
  import Icon from '../Icon.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ItemPicture from './ItemPicture.svelte';

  // Pictures kept with a book, fic or character. Uploaded pictures sync through the
  // private data repo (images/…); links are shown from where they are.
  let {
    images,
    ownerId,
    title,
    empty,
    latest,
    onsave,
    mainId = undefined,
    onsetmain = undefined,
  }: {
    images: ItemImage[];
    ownerId: string; // used in uploaded file names
    title: string;
    empty: string;
    /** The current list (read fresh before each change, so quick edits don't overwrite each other). */
    latest: () => ItemImage[];
    onsave: (images: ItemImage[]) => Promise<void>;
    mainId?: string;
    onsetmain?: (id: string) => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();
  let adding = $state<null | 'link'>(null);
  let link = $state('');
  let caption = $state('');
  let busy = $state(false);
  let viewing = $state<number | null>(null);

  const saveImages = (next: ItemImage[]) => onsave(next);

  async function upload(e: Event) {
    const files = [...((e.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    if (!files.length) return;
    busy = true;
    const added: ItemImage[] = [];
    try {
      for (const f of files) {
        try {
          // Large enough to read details on a character sheet, small enough to sync quickly.
          const blob = await resizeImage(f, 1600, 1600);
          added.push({ id: newId(), url: await saveRepoImage('images', ownerId, blob), addedAt: nowIso() });
        } catch {
          toasts.show(`“${f.name}” isn’t a picture this device can read.`, 'error');
        }
      }
      if (added.length) {
        await saveImages([...(latest()), ...added]);
        toasts.show(added.length === 1 ? 'Picture added.' : `${added.length} pictures added.`);
      }
    } finally {
      busy = false;
    }
  }

  function validLink(s: string): string | undefined {
    try {
      const u = new URL(s.trim());
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
    } catch {
      return undefined;
    }
  }

  async function addLink(e: Event) {
    e.preventDefault();
    const url = validLink(link);
    if (!url) return toasts.show('That doesn’t look like a web link.', 'error');
    await saveImages([...(latest()), { id: newId(), url, caption: caption.trim() || undefined, addedAt: nowIso() }]);
    link = '';
    caption = '';
    adding = null;
  }

  async function setCaption(id: string, text: string) {
    await saveImages((latest()).map((i) => (i.id === id ? { ...i, caption: text.trim() || undefined } : i)));
  }

  async function remove(id: string) {
    const img = (latest()).find((i) => i.id === id);
    if (!img || !confirm('Remove this picture?')) return;
    await saveImages((latest()).filter((i) => i.id !== id));
    await discardCover(img.url);
    if (viewing !== null) {
      const left = (latest()).length;
      viewing = left ? Math.min(viewing, left - 1) : null;
    }
  }
</script>

<section>
  <div class="row head">
    <h2>Pictures</h2>
    <div class="row">
      <button type="button" class="btn ghost small" disabled={busy} onclick={() => input?.click()}>
        <Icon name="upload" size={16} /> {busy ? 'Adding…' : 'Upload'}
      </button>
      <button type="button" class="btn ghost small" onclick={() => (adding = adding ? null : 'link')}><Icon name="link" size={16} /> Add link</button>
    </div>
  </div>
  <input bind:this={input} type="file" accept="image/*" multiple hidden onchange={upload} />

  {#if adding === 'link'}
    <form class="add stack" onsubmit={addLink}>
      <label class="field">
        <span>Link to the picture</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={link} inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…" autofocus />
      </label>
      <label class="field">
        <span>Caption <span class="muted">(optional, e.g. the character’s name)</span></span>
        <input bind:value={caption} autocomplete="off" />
      </label>
      <p class="small muted" style="margin:0">
        Linked pictures are shown from their website, so they need the internet and disappear if the site removes them. To keep
        a copy, save the picture to your phone and use Upload instead.
      </p>
      <div class="row">
        <button type="submit" class="btn primary small" disabled={!link.trim()}>Add</button>
        <button type="button" class="btn ghost small" onclick={() => (adding = null)}>Cancel</button>
      </div>
    </form>
  {/if}

  {#if images.length}
    <ul class="grid">
      {#each images as img, i (img.id)}
        <li>
          <button type="button" class="thumb" aria-label="Open picture{img.caption ? `: ${img.caption}` : ''}" onclick={() => (viewing = i)}>
            <ItemPicture url={img.url} alt={img.caption ?? ''} />
          </button>
          {#if img.caption || (onsetmain && img.id === (mainId ?? images[0]?.id))}
            <span class="cap small">{img.caption ?? ''}{onsetmain && img.id === (mainId ?? images[0]?.id) ? ' ★' : ''}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if !adding}
    <p class="muted small">{empty}</p>
  {/if}
</section>

{#if viewing !== null && images[viewing]}
  <ImageViewer
    {images}
    index={viewing}
    {title}
    {mainId}
    {onsetmain}
    onindex={(i) => (viewing = i)}
    onclose={() => (viewing = null)}
    oncaption={setCaption}
    onremove={remove}
  />
{/if}

<style>
  .head {
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }

  h2 {
    margin: 0;
  }

  .add {
    gap: 0.6rem;
    margin-bottom: 0.8rem;
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 0.6rem;
  }

  .grid li {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .thumb {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 4;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface-2);
    cursor: zoom-in;
  }

  .cap {
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
</style>
