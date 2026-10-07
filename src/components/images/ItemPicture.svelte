<script lang="ts">
  import { coverSrc } from '../../lib/covers';

  // One picture: uploaded ones load from this device (or the data repo), links load directly.
  let { url, alt = '', fit = 'cover' }: { url: string; alt?: string; fit?: 'cover' | 'contain' } = $props();

  let src = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    const u = url;
    failed = false;
    src = null;
    let live = true;
    coverSrc(u).then((s) => {
      if (!live) return;
      if (s) src = s;
      else failed = true;
    });
    return () => (live = false);
  });
</script>

{#if failed}
  <span class="missing small muted">Couldn’t load this picture</span>
{:else if src}
  <img {src} {alt} class={fit} loading="lazy" referrerpolicy="no-referrer" onerror={() => (failed = true)} />
{:else}
  <span class="missing" aria-hidden="true"></span>
{/if}

<style>
  img {
    display: block;
    width: 100%;
    height: 100%;
  }

  img.cover {
    object-fit: cover;
  }

  img.contain {
    object-fit: contain;
  }

  .missing {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0.4rem;
    text-align: center;
    background: var(--surface-2);
  }
</style>
