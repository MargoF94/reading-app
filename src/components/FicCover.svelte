<script lang="ts">
  import { ficCoverColors, shipLabel, shortFandom, titleScale } from '../lib/ficCover';
  import type { Item } from '../lib/types';

  // A fic's cover when it has no picture: a paperback with three bands. Sizes follow the
  // cover's width. Small covers (lists, where the title is written beside them) drop the
  // small print, and tiny ones the title too.
  let { item, author }: { item: Item; author: string } = $props();

  const colors = $derived(ficCoverColors(item));
  const fandom = $derived(item.fic?.fandoms[0] ? shortFandom(item.fic.fandoms[0]) : '');
  const ship = $derived(shipLabel(item));
</script>

<div
  class="fic-cover"
  style:--band={colors.band}
  style:--rule={colors.rule}
  style:--paper={colors.paper}
  style:--on-band={colors.onBand}
  style:--by={colors.by}
  style:--ts={titleScale(item.title)}
>
  <div class="band top">
    {#if fandom}<span class="fandom small">{fandom}</span>{/if}
  </div>
  <div class="middle">
    <span class="title">{item.title}</span>
    <span class="line"></span>
    {#if author}<span class="author small">{author}</span>{/if}
  </div>
  <div class="band bottom">
    {#if ship}<span class="ship small">{ship}</span>
    {:else}<span class="ship series small">Archive of Our Own</span>{/if}
  </div>
</div>

<style>
  .fic-cover {
    --sans: Jost, Futura, 'Avenir Next', var(--font);
    --serif: Literata, var(--font-serif);
    --italic: 'EB Garamond', var(--font-serif);
    /* Inline, so a link around the cover doesn't underline the title. */
    display: inline-flex;
    vertical-align: top;
    width: 100%;
    height: 100%;
    flex-direction: column;
    background: var(--paper);
    container-type: inline-size;
    line-height: 1.15;
    overflow-wrap: anywhere;
    overflow: hidden;
  }

  .band {
    background: var(--band);
    color: var(--on-band);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 8cqw;
    min-width: 0;
  }

  .top {
    flex: 0 0 33%;
    border-bottom: 1.6cqw solid var(--rule);
  }

  .bottom {
    flex: 0 0 16%;
    border-top: 1.6cqw solid var(--rule);
  }

  .fandom {
    font-family: var(--sans);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 5.6cqw;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }

  .ship {
    font-family: var(--italic);
    font-style: italic;
    font-weight: 600;
    font-size: 7.6cqw;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ship.series {
    font-family: var(--sans);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 4.4cqw;
  }

  .middle {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4cqw;
    padding: 5cqw 9cqw;
    text-align: center;
    color: #22201c;
  }

  .title {
    font-family: var(--serif);
    font-weight: 500;
    font-size: max(9px, calc(11cqw * var(--ts)));
    line-height: 1.12;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
  }

  .line {
    flex: none;
    width: 14cqw;
    height: 0.9cqw;
    background: var(--band);
  }

  .author {
    font-family: var(--sans);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 4.8cqw;
    color: var(--by);
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @container (max-width: 90px) {
    .small {
      display: none;
    }
  }

  @container (max-width: 60px) {
    .title {
      display: none;
    }
  }
</style>
