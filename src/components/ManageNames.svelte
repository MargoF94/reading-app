<script lang="ts">
  import { library, type NamedCollection } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Author, Item, NamedRecord } from '../lib/types';
  import { normalize } from '../lib/util';
  import Icon from './Icon.svelte';

  // Rename / delete entries of a reference list (publishers, genres, tags…).
  let { collection, title }: { collection: NamedCollection; title: string } = $props();

  const records = $derived(library.named(collection) as NamedRecord[]);
  let editingId = $state<string | null>(null);
  let draft = $state('');
  let altDraft = $state('');
  let filter = $state('');

  const altNames = (rec: NamedRecord) => (collection === 'authors' ? ((rec as Author).altNames ?? []) : []);
  const shown = $derived(
    filter.trim()
      ? records.filter((r) => [r.name, ...altNames(r)].some((n) => normalize(n).includes(normalize(filter))))
      : records,
  );

  function startEdit(rec: NamedRecord) {
    editingId = rec.id;
    draft = rec.name;
    altDraft = altNames(rec).join(', ');
  }

  async function save(rec: NamedRecord) {
    const name = draft.trim();
    if (!name) return;
    const clash = records.find((r) => r.id !== rec.id && normalize(r.name) === normalize(name));
    if (clash) {
      toasts.show(`“${name}” already exists.`, 'error');
      return;
    }
    const next: NamedRecord = { ...rec, name };
    if (collection === 'authors') {
      (next as Author).altNames = altDraft
        .split(/[,、，]/)
        .map((n) => n.trim())
        .filter((n) => n && normalize(n) !== normalize(name));
    }
    editingId = null;
    await library.put(collection, [next] as never);
  }

  async function remove(rec: NamedRecord) {
    const used = library.usageCount(collection, rec.id);
    const msg = used
      ? `“${rec.name}” is used by ${used} item(s). Remove it from them and delete?`
      : `Delete “${rec.name}”?`;
    if (!confirm(msg)) return;
    if (used) {
      const updated: Item[] = library.items
        .filter((i) => usesRecord(i, rec.id))
        .map((i) => strip(i, rec.id));
      await library.put('items', updated);
    }
    await library.remove(collection, [rec]);
  }

  function usesRecord(i: Item, id: string): boolean {
    return (
      i.authorIds.includes(id) ||
      i.genreIds.includes(id) ||
      i.tagIds.includes(id) ||
      i.seriesId === id ||
      i.book?.publisherId === id
    );
  }

  function strip(i: Item, id: string): Item {
    const out: Item = {
      ...i,
      authorIds: i.authorIds.filter((x) => x !== id),
      genreIds: i.genreIds.filter((x) => x !== id),
      tagIds: i.tagIds.filter((x) => x !== id),
    };
    if (out.seriesId === id) {
      out.seriesId = undefined;
      out.seriesNumber = undefined;
    }
    if (out.book?.publisherId === id) out.book = { ...out.book, publisherId: undefined };
    return out;
  }
</script>

<details class="manage">
  <summary>{title} <span class="muted small">({records.length})</span></summary>
  {#if records.length === 0}
    <p class="muted small">None yet. They are added from the book form.</p>
  {:else}
    {#if records.length > 12}
      <input class="filter" type="search" bind:value={filter} placeholder="Filter {title.toLowerCase()}…" aria-label="Filter" />
    {/if}
    <ul>
      {#each shown as rec (rec.id)}
        <li>
          {#if editingId === rec.id}
            <form
              class="edit"
              onsubmit={(e) => {
                e.preventDefault();
                void save(rec);
              }}
            >
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={draft} autofocus aria-label="Name" onkeydown={(e) => e.key === 'Escape' && (editingId = null)} />
              {#if collection === 'authors'}
                <input
                  bind:value={altDraft}
                  aria-label="Other names"
                  placeholder="Other names, comma-separated (e.g. 村上春樹)"
                  onkeydown={(e) => e.key === 'Escape' && (editingId = null)}
                />
              {/if}
              <div class="row">
                <button class="btn small primary">Save</button>
                <button type="button" class="btn small" onclick={() => (editingId = null)}>Cancel</button>
              </div>
            </form>
          {:else}
            <span class="name">
              {rec.name}
              {#if altNames(rec).length}<span class="muted small">· {altNames(rec).join(', ')}</span>{/if}
            </span>
            <span class="muted small">{library.usageCount(collection, rec.id)}</span>
            <button
              type="button"
              class="btn ghost icon small"
              aria-label="Edit {rec.name}"
              onclick={() => startEdit(rec)}
            >
              <Icon name="edit" size={16} />
            </button>
            <button type="button" class="btn ghost icon small" aria-label="Delete {rec.name}" onclick={() => remove(rec)}>
              <Icon name="trash" size={16} />
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</details>

<style>
  .manage {
    border-bottom: 1px solid var(--border);
    padding: 0.6rem 0;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .edit {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.4rem 0;
  }

  .filter {
    margin-top: 0.5rem;
  }
</style>
