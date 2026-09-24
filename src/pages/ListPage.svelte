<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import { STATUS_LABEL } from '../lib/constants';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { ListEntry, ReadingList } from '../lib/types';

  let { id }: { id: string } = $props();

  const list = $derived(library.list(id));
  let editing = $state(false);
  let name = $state('');
  let description = $state('');

  // Entries shown (in order). While dragging, the order changes locally and is saved on release.
  let order = $state.raw<ListEntry[]>([]);
  $effect(() => {
    if (dragging === null) order = (list?.entries ?? []).filter((e) => library.item(e.itemId));
  });

  let dragging = $state<number | null>(null);
  let rows: HTMLElement[] = $state([]);

  async function save(entries: ListEntry[], patch: Partial<ReadingList> = {}) {
    if (!list) return;
    await library.saveList({ ...list, ...patch, entries });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [e] = next.splice(from, 1);
    next.splice(to, 0, e);
    order = next;
    return next;
  }

  async function moveAndSave(from: number, to: number) {
    const next = move(from, to);
    if (next) await save(next);
  }

  // Pointer-based dragging (mouse and touch) on the handle.
  function dragStart(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = i;
  }

  function dragMove(e: PointerEvent) {
    if (dragging === null) return;
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j]?.getBoundingClientRect();
      if (r && e.clientY >= r.top && e.clientY <= r.bottom && j !== dragging) {
        move(dragging, j);
        dragging = j;
        break;
      }
    }
  }

  async function dragEnd() {
    if (dragging === null) return;
    dragging = null;
    await save(order);
  }

  async function setNote(i: number, note: string) {
    const next = order.map((e, j) => (j === i ? { ...e, note: note.trim() || undefined } : e));
    order = next;
    await save(next);
  }

  async function removeAt(i: number) {
    const next = order.filter((_, j) => j !== i);
    order = next;
    await save(next);
  }

  async function saveDetails(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    await save(order, { name: name.trim(), description: description.trim() || undefined });
    editing = false;
  }

  async function deleteList() {
    if (!list || !confirm(`Delete the list “${list.name}”? The books themselves stay in your library.`)) return;
    await library.remove('lists', [list]);
    toasts.show('List deleted.');
    router.go('/lists', true);
  }
</script>

<div class="top">
  <button type="button" class="btn ghost small" onclick={() => router.back('/lists')}>
    <Icon name="back" size={18} /> Lists
  </button>
  {#if list && !editing}
    <div class="row">
      <button
        type="button"
        class="btn small"
        onclick={() => {
          name = list.name;
          description = list.description ?? '';
          editing = true;
        }}
      >
        <Icon name="edit" size={16} /> Edit
      </button>
      <button type="button" class="btn small danger" onclick={deleteList}><Icon name="trash" size={16} /> Delete</button>
    </div>
  {/if}
</div>

{#if !list}
  <div class="empty">
    <h1>List not found</h1>
    <p><a href="#/lists">All lists</a></p>
  </div>
{:else}
  {#if editing}
    <form class="card stack edit" onsubmit={saveDetails}>
      <label class="field"><span>Name</span><input bind:value={name} required /></label>
      <label class="field"><span>Description</span><textarea bind:value={description} rows="3"></textarea></label>
      <div class="row">
        <button class="btn primary">Save</button>
        <button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
      </div>
    </form>
  {:else}
    <h1>{list.name}</h1>
    {#if list.description}<p class="desc">{list.description}</p>{/if}
  {/if}

  {#if order.length === 0}
    <p class="empty">This list is empty. Open a book or fic and use “Add to a list”.</p>
  {:else}
    <ol class="entries" class:dragging={dragging !== null}>
      {#each order as entry, i (entry.itemId)}
        {@const item = library.item(entry.itemId)}
        {#if item}
          <li bind:this={rows[i]} class:active={dragging === i}>
            <button
              type="button"
              class="handle"
              aria-label="Drag to reorder"
              onpointerdown={(e) => dragStart(e, i)}
              onpointermove={dragMove}
              onpointerup={dragEnd}
              onpointercancel={dragEnd}
            >
              <Icon name="grip" size={18} />
            </button>
            <span class="num">{i + 1}</span>
            <a href="#/item/{item.id}" class="cover-link"><Cover {item} width={44} /></a>
            <div class="info">
              <a href="#/item/{item.id}" class="title">{item.title}</a>
              <span class="small muted">{library.authorNames(item)} · {STATUS_LABEL[library.status(item.id)]}</span>
              <input
                class="note"
                value={entry.note ?? ''}
                placeholder="Add a note…"
                aria-label="Note for {item.title}"
                onchange={(e) => setNote(i, e.currentTarget.value)}
              />
            </div>
            <div class="tools">
              <button type="button" class="btn ghost icon small" aria-label="Move up" disabled={i === 0} onclick={() => moveAndSave(i, i - 1)}>
                <Icon name="up" size={16} />
              </button>
              <button type="button" class="btn ghost icon small" aria-label="Move down" disabled={i === order.length - 1} onclick={() => moveAndSave(i, i + 1)}>
                <Icon name="chevron" size={16} />
              </button>
              <button type="button" class="btn ghost icon small" aria-label="Remove from list" onclick={() => removeAt(i)}>
                <Icon name="close" size={16} />
              </button>
            </div>
          </li>
        {/if}
      {/each}
    </ol>
  {/if}
{/if}

<style>
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .edit {
    max-width: 560px;
    margin-bottom: 1rem;
  }

  .desc {
    color: var(--text-2);
    max-width: 760px;
    white-space: pre-line;
  }

  .entries {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    max-width: 800px;
  }

  .entries li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.3rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }

  .entries li.active {
    background: var(--surface);
    box-shadow: var(--shadow);
    border-radius: var(--radius-sm);
  }

  .dragging {
    user-select: none;
  }

  .handle {
    border: none;
    background: none;
    color: var(--text-2);
    padding: 8px 2px;
    cursor: grab;
    touch-action: none;
    display: flex;
  }

  .num {
    width: 1.6rem;
    text-align: right;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .cover-link {
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .title {
    color: inherit;
    font-weight: 600;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .title:hover {
    color: var(--accent);
  }

  .note {
    min-height: 32px;
    padding: 0.2em 0.5em;
    font-size: 0.85rem;
    border-color: transparent;
    background: transparent;
  }

  .note:hover,
  .note:focus {
    border-color: var(--border);
    background: var(--surface);
  }

  .tools {
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 560px) {
    .tools {
      flex-direction: row;
    }
  }
</style>
