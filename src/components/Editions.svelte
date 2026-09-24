<script lang="ts">
  import { FORMAT_LABEL, LANGUAGE_NAME, STATUS_LABEL } from '../lib/constants';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import Combobox from './Combobox.svelte';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';

  // Other editions of the same work: originals, translations, other formats.
  let { item }: { item: Item } = $props();

  const editions = $derived(library.editionsOf(item));
  let adding = $state(false);

  const describe = (i: Item) =>
    [
      i.language ? LANGUAGE_NAME[i.language] : '',
      i.type === 'fic' ? 'Fic' : i.book?.format ? FORMAT_LABEL[i.book.format] : '',
      i.book?.publicationDate?.slice(0, 4),
    ]
      .filter(Boolean)
      .join(' · ');

  const options = $derived(
    library.items
      .filter((i) => i.id !== item.id && (!item.workKey || i.workKey !== item.workKey))
      .map((i) => ({ value: i.id, label: `${i.title} — ${library.authorNames(i) || '?'}${describe(i) ? ` (${describe(i)})` : ''}` })),
  );

  async function link(id: string | undefined) {
    const other = id ? library.item(id) : undefined;
    if (!other) return;
    await library.linkEditions(item, other);
    adding = false;
  }
</script>

<section>
  <div class="row head">
    <h2>Other editions</h2>
    {#if !adding}
      <button type="button" class="btn small" onclick={() => (adding = true)}><Icon name="link" size={16} /> Link an edition</button>
    {/if}
  </div>
  {#if adding}
    <div class="add">
      <Combobox options={options} value={undefined} onchange={link} placeholder="Search your library for the other edition…" clearable={false} />
      <p class="small muted">For example the Japanese original of a translation you own, or the ebook and the paperback.</p>
      <button type="button" class="btn small ghost" onclick={() => (adding = false)}>Cancel</button>
    </div>
  {/if}
  {#if editions.length}
    <ul>
      {#each editions as e (e.id)}
        <li>
          <a href="#/item/{e.id}" class="entry">
            <Cover item={e} width={40} />
            <span class="info">
              <strong>{e.title}</strong>
              <span class="small muted">{describe(e)}{describe(e) ? ' · ' : ''}{STATUS_LABEL[library.status(e.id)]}</span>
            </span>
          </a>
          <button type="button" class="btn ghost icon small" aria-label="Unlink {e.title}" onclick={() => library.unlinkEdition(e)}>
            <Icon name="close" size={16} />
          </button>
        </li>
      {/each}
    </ul>
  {:else if !adding}
    <p class="small muted">None linked.</p>
  {/if}
</section>

<style>
  .head {
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  .head h2 {
    margin: 0;
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
    max-width: 480px;
  }

  .add :global(.combo) {
    width: 100%;
  }

  .add p {
    margin: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex: 1;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }

  .entry:hover strong {
    color: var(--accent);
  }

  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
