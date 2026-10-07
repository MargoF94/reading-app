<script lang="ts">
  import { discardCover, resizeImage, saveRepoImage } from '../../lib/covers';
  import { library } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';
  import type { Item, ItemImage } from '../../lib/types';
  import { newId, nowIso } from '../../lib/util';
  import Icon from '../Icon.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ItemPicture from './ItemPicture.svelte';

  // Pictures kept with a book or fic: character references, maps, fan art…
  // Uploaded pictures sync through the private data repo; links are shown from where they are.
  let { item }: { item: Item } = $props();

  const images = $derived(item.images ?? []);
  const current = () => library.item(item.id) ?? item;

  let input: HTMLInputElement | undefined = $state();
  let adding = $state<null | 'link'>(null);
  let link = $state('');
  let caption = $state('');
  let busy = $state(false);
  let viewing = $state<number | null>(null);

  async function saveImages(next: ItemImage[]) {
    const fresh = current();
    await library.saveItem({ ...fresh, images: next });
  }

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
          added.push({ id: newId(), url: await saveRepoImage('images', item.id, blob), addedAt: nowIso() });
        } catch {
          toasts.show(`“${f.name}” isn’t a picture this device can read.`, 'error');
        }
      }
      if (added.length) {
        await saveImages([...(current().images ?? []), ...added]);
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
    await saveImages([...(current().images ?? []), { id: newId(), url, caption: caption.trim() || undefined, addedAt: nowIso() }]);
    link = '';
    caption = '';
    adding = null;
  }

  async function setCaption(id: string, text: string) {
    await saveImages((current().images ?? []).map((i) => (i.id === id ? { ...i, caption: text.trim() || undefined } : i)));
  }

  async function remove(id: string) {
    const img = (current().images ?? []).find((i) => i.id === id);
    if (!img || !confirm('Remove this picture?')) return;
    await saveImages((current().images ?? []).filter((i) => i.id !== id));
    await discardCover(img.url);
    if (viewing !== null) {
      const left = (current().images ?? []).length;
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
          {#if img.caption}<span class="cap small">{img.caption}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else if !adding}
    <p class="muted small">Keep pictures with this {item.type === 'fic' ? 'fic' : 'book'}, such as character references or maps. Upload them from your device or add a link.</p>
  {/if}
</section>

{#if viewing !== null && images[viewing]}
  <ImageViewer
    {images}
    index={viewing}
    title={item.title}
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
