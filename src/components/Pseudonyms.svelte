<script lang="ts">
  import { tick } from 'svelte';
  import { library } from '../lib/store.svelte';
  import type { Author } from '../lib/types';
  import { plural } from '../lib/util';
  import Combobox from './Combobox.svelte';
  import Icon from './Icon.svelte';

  // Pseudonyms on an author's page: other names the same person writes under. Linked both
  // ways, so each name's page lists the others; each name keeps its own books.
  let { author }: { author: Author } = $props();

  const others = $derived(library.pseudonymsOf(author));
  let adding = $state(false);

  const books = (id: string) => library.items.filter((i) => i.authorIds.includes(id)).length;

  // Any other author can be linked (not this one, nor the names already linked to it).
  const options = $derived(
    library
      .named('authors')
      .filter((a) => a.id !== author.id && !others.some((o) => o.id === a.id))
      .map((a) => ({ value: a.id, label: a.altNames?.length ? `${a.name} (${a.altNames.join(', ')})` : a.name })),
  );

  async function start() {
    adding = true;
    await tick();
    document.getElementById('pseudonym-pick')?.focus();
  }

  async function link(id: string | undefined) {
    const other = id ? library.author(id) : undefined;
    if (other) await library.linkPseudonyms(author, other);
    adding = false;
  }
</script>

{#if others.length || adding}
  <section class="pseudonyms">
    <div class="head">
      <h2>Also writes as</h2>
      {#if !adding}
        <button type="button" class="btn small" onclick={start}><Icon name="link" size={16} /> Add a pseudonym</button>
      {/if}
    </div>
    {#if adding}
      <div class="add">
        <p class="small muted">
          The same person writing under another name. Each name keeps its own books, and their pages link to each other.
        </p>
        <!-- Cancel beside the box, where the list of authors opening under it can't cover it. -->
        <div class="pick">
          <label class="visually-hidden" for="pseudonym-pick">Pseudonym</label>
          <Combobox
            id="pseudonym-pick"
            {options}
            value={undefined}
            onchange={link}
            oncreate={(name) => library.ensureNamed('authors', name)}
            placeholder="Search your authors, or type a new name…"
            clearable={false}
          />
          <button type="button" class="btn small ghost" onclick={() => (adding = false)}>Cancel</button>
        </div>
      </div>
    {/if}
    {#if others.length}
      <ul>
        {#each others as a (a.id)}
          <li>
            <a href="#/browse/authors/{a.id}" class="name">{a.name}</a>
            <span class="count small muted">{plural(books(a.id), 'item')}</span>
            <button
              type="button"
              class="btn ghost icon small"
              aria-label="Unlink {a.name}"
              title="Not the same person: unlink {a.name}"
              onclick={() => library.unlinkPseudonym(a)}><Icon name="close" size={16} /></button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <button type="button" class="btn small add-first" onclick={start}><Icon name="link" size={16} /> Add a pseudonym</button>
{/if}

<style>
  .pseudonyms {
    max-width: 760px;
    margin-bottom: 1.2rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.3rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .add {
    max-width: 520px;
    margin-bottom: 0.5rem;
  }

  .add p {
    margin: 0 0 0.4rem;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .pick :global(.combo) {
    flex: 1;
    min-width: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--border);
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .count {
    flex: 1;
    white-space: nowrap;
  }

  .add-first {
    margin-bottom: 1rem;
  }
</style>
