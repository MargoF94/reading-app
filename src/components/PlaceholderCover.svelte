<script lang="ts">
  import { coverText, cracks, isCjk, seedOf, titleScale, variant, windowTracery } from '../lib/placeholderCover';
  import type { Item } from '../lib/types';

  // A cover for a book, manga or fic without a picture: a faded gothic window in fog, a
  // couple of cracks, and the title in worn white capitals. The fog, grain and wear are
  // pictures shared by every cover, so a long list stays quick; each cover shows its own
  // part of them. Small covers drop the small print, and tiny ones the title too.
  let { item, author, series }: { item: Item; author: string; series?: string } = $props();

  const seed = $derived(seedOf(item));
  const text = $derived(coverText(item, series));
  const tracery = $derived(windowTracery(variant(seed, 3)));
  const lines = $derived(cracks(seed));
  const scale = $derived(titleScale(item.title) * (isCjk(item.title) ? 0.8 : 1));
</script>

<div
  class="ph"
  style:--ts={scale}
  style:--fog-x="{seed % 101}%"
  style:--wear-pos="{(seed >>> 3) % 97}% {(seed >>> 11) % 89}%"
  style:--grain-pos="{(seed >>> 5) % 100}% {(seed >>> 13) % 100}%"
>
  <svg class="art" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="window">
      {#each tracery as t, i (i)}<path d={t.d} stroke-width={t.w} />{/each}
    </g>
  </svg>
  <div class="fog"></div>
  <svg class="art" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="cracks">
      {#each lines as points, i (i)}<polyline {points} />{/each}
    </g>
  </svg>
  <div class="grain"></div>

  {#if text.label}<span class="box small">{text.label}</span>{/if}
  <div class="center">
    <span class="title-wrap"><span class="title">{item.title}</span></span>
    {#if text.subtitle}<span class="sub small">{text.subtitle}</span>{/if}
  </div>
  <div class="foot">
    {#if text.tagline}<span class="tag small">{text.tagline}</span>{/if}
    {#if author}<span class="author small">{author}</span>{/if}
  </div>
</div>

<style>
  .ph {
    --ink: #f1efe9;
    --grey: #a6a5a1;
    --condensed: Oswald, 'Arial Narrow', 'Helvetica Neue', var(--font);
    --caps: Jost, 'Avenir Next', var(--font);
    position: relative;
    /* Inline, so a link around the cover doesn't underline the title. */
    display: inline-block;
    vertical-align: top;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: radial-gradient(75% 75% at 50% 32%, #3b3c3e, #151617 60%, #070708);
    color: var(--ink);
    container-type: inline-size;
    line-height: 1.1;
    overflow-wrap: anywhere;
    text-align: center;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }

  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  .window {
    fill: none;
    stroke: #a9a9a6;
    opacity: 0.24;
  }

  .cracks {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.7;
    stroke-linejoin: round;
    stroke-linecap: round;
    opacity: 0.5;
  }

  /* Fog over the lower half, a different stretch of it on each cover. */
  .fog {
    position: absolute;
    inset: 0;
    background: url('../assets/covers/fog.svg') var(--fog-x) 0 / 200% 100% no-repeat;
    opacity: 0.5;
    -webkit-mask-image: linear-gradient(transparent 35%, #000 75%);
    mask-image: linear-gradient(transparent 35%, #000 75%);
  }

  .grain {
    position: absolute;
    inset: 0;
    background: url('../assets/covers/grain.svg') var(--grain-pos) / 100cqw 100cqw repeat;
  }

  .box,
  .sub,
  .tag,
  .author {
    font-family: var(--caps);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .box {
    position: absolute;
    left: 50%;
    top: 7%;
    translate: -50% 0;
    max-width: 80%;
    padding: 1.2cqw 3cqw;
    border: 0.6cqw solid rgb(241 239 233 / 0.8);
    font-size: 3.8cqw;
    letter-spacing: 0.2em;
  }

  .center {
    position: absolute;
    left: 8cqw;
    right: 8cqw;
    top: 50%;
    translate: 0 -46%;
  }

  .title-wrap {
    position: relative;
    display: block;
  }

  .title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
    font-family: var(--condensed);
    font-weight: 600;
    text-transform: uppercase;
    font-size: max(9px, calc(15cqw * var(--ts)));
    line-height: 0.98;
    letter-spacing: 0.02em;
    text-shadow: 0 0 1.5cqw rgb(0 0 0 / 0.6);
  }

  /* Specks and scratches in the cover black, so the title looks worn. */
  .title-wrap::after {
    content: '';
    position: absolute;
    inset: 0;
    background: url('../assets/covers/wear.svg') var(--wear-pos) / 100cqw 50cqw repeat;
    opacity: 0.92;
    pointer-events: none;
  }

  .sub {
    display: block;
    margin-top: 3cqw;
    font-size: 4.6cqw;
    letter-spacing: 0.22em;
    color: var(--grey);
  }

  .foot {
    position: absolute;
    left: 8cqw;
    right: 8cqw;
    bottom: 7%;
  }

  .tag {
    display: block;
    font-size: 3.4cqw;
    letter-spacing: 0.2em;
    color: var(--grey);
    margin-bottom: 1.5cqw;
  }

  .author {
    display: block;
    font-size: 5.4cqw;
    letter-spacing: 0.2em;
  }

  @container (max-width: 90px) {
    .small {
      display: none;
    }
  }

  @container (max-width: 60px) {
    .title-wrap {
      display: none;
    }
  }
</style>
