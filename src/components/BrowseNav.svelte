<script lang="ts">
  import { BROWSE_KINDS } from '../lib/browse';

  // Row of links to the browse pages; scrolls sideways on narrow screens.
  let { current = '' }: { current?: string } = $props();
  const links = [
    { href: '#/library', label: 'All', key: 'library' },
    { href: '#/lists', label: 'Lists', key: 'lists' },
    ...BROWSE_KINDS.filter((k) => !['characters', 'fictags'].includes(k.kind)).map((k) => ({
      href: `#/browse/${k.kind}`,
      label: k.label,
      key: k.kind,
    })),
  ];
</script>

<nav class="browse-nav" aria-label="Browse">
  {#each links as l (l.key)}
    <a href={l.href} class="chip" class:accent={current === l.key} aria-current={current === l.key ? 'page' : undefined}>
      {l.label}
    </a>
  {/each}
</nav>

<style>
  .browse-nav {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.3rem;
    margin-bottom: 1rem;
    scrollbar-width: thin;
  }

  .browse-nav a {
    white-space: nowrap;
    padding: 0.35em 0.9em;
  }
</style>
