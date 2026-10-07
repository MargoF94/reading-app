<script lang="ts">
  import { mainImage } from '../../lib/characters';
  import type { Character } from '../../lib/types';
  import ItemPicture from '../images/ItemPicture.svelte';

  // A round picture of a character: their main picture, or their initials.
  let { character = undefined, name, size = 32 }: { character?: Character; name: string; size?: number } = $props();

  const img = $derived(mainImage(character));
  const initials = $derived(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0])
      .join('')
      .toUpperCase(),
  );
  // A steady muted color per name.
  const hue = $derived([...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) % 360, 7));
</script>

<span
  class="avatar"
  class:initials={!img}
  style:width="{size}px"
  style:height="{size}px"
  style:--h={hue}
  style:font-size="{Math.round(size * 0.38)}px"
  aria-hidden="true"
>
  {#if img}<ItemPicture url={img.url} />{:else}{initials}{/if}
</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--border);
    background: var(--surface-2);
  }

  .initials {
    background: hsl(var(--h) 18% 42%);
    color: #f1f2f3;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .avatar :global(img) {
    border-radius: 50%;
  }
</style>
