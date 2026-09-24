<script lang="ts">
  import { library, type NamedCollection } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Item, NamedRecord } from '../lib/types';
  import { normalize } from '../lib/util';
  import Icon from './Icon.svelte';

  // Rename / delete entries of a reference list (publishers, genres, tags…).
  let { collection, title }: { collection: NamedCollection; title: string } = $props();

  const records = $derived(library.named(collection) as NamedRecord[]);
  let editingId = $state<string | null>(null);
  let draft = $state('');

  async function rename(rec: NamedRecord) {
    const name = draft.trim();
    editingId = null;
    if (!name || name === rec.name) return;
    const clash = records.find((r) => r.id !== rec.id && normalize(r.name) === normalize(name));
    if (clash) {
      toasts.show(`“${name}” already exists.`, 'error');
      return;
    }
    await library.put(collection, [{ ...rec, name }] as never);
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
    <ul>
      {#each records as rec (rec.id)}
        <li>
          {#if editingId === rec.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              bind:value={draft}
              autofocus
              aria-label="New name"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void rename(rec);
                } else if (e.key === 'Escape') editingId = null;
              }}
              onblur={() => rename(rec)}
            />
          {:else}
            <span class="name">{rec.name}</span>
            <span class="muted small">{library.usageCount(collection, rec.id)}</span>
            <button
              type="button"
              class="btn ghost icon small"
              aria-label="Rename {rec.name}"
              onclick={() => {
                editingId = rec.id;
                draft = rec.name;
              }}
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
</style>
