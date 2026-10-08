<script lang="ts">
  import { isRepoCover } from '../../lib/covers';
  import type { ItemImage } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import ItemPicture from './ItemPicture.svelte';

  // Full-screen picture with its caption; swipe or arrows for the next one.
  let {
    images,
    index,
    title,
    onindex,
    onclose,
    oncaption,
    onremove,
    mainId = undefined,
    onsetmain = undefined,
  }: {
    images: ItemImage[];
    index: number;
    title: string;
    onindex: (i: number) => void;
    onclose: () => void;
    oncaption: (id: string, text: string) => void;
    onremove: (id: string) => void;
    mainId?: string;
    onsetmain?: (id: string) => void;
  } = $props();


  const img = $derived(images[index]);
  const isMain = $derived(!!onsetmain && img.id === (mainId ?? images[0]?.id));
  let editing = $state(false);
  let text = $state('');
  let startX = 0;

  const go = (by: number) => {
    const i = index + by;
    if (i >= 0 && i < images.length) {
      editing = false;
      onindex(i);
    }
  };

  function key(e: KeyboardEvent) {
    if (editing) return;
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }

  function saveCaption(e: Event) {
    e.preventDefault();
    oncaption(img.id, text);
    editing = false;
  }

  $effect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => (html.style.overflow = before);
  });
</script>

<svelte:window onkeydown={key} />

<div class="viewer" role="dialog" aria-modal="true" aria-label="Pictures for {title}">
  <div class="bar">
    <span class="count small">{index + 1} / {images.length}</span>
    <div class="row">
      {#if !isRepoCover(img.url)}
        <a class="btn ghost icon" href={img.url} target="_blank" rel="noopener noreferrer" aria-label="Open the picture’s website"><Icon name="external" size={20} /></a>
      {/if}
      {#if onsetmain}
        <button
          type="button"
          class="btn ghost small"
          aria-pressed={isMain}
          disabled={isMain}
          onclick={() => onsetmain(img.id)}>{isMain ? '★ Main picture' : '☆ Make main picture'}</button
        >
      {/if}
      <button type="button" class="btn ghost icon" aria-label="Remove picture" onclick={() => onremove(img.id)}><Icon name="trash" size={20} /></button>
      <button type="button" class="btn ghost icon" aria-label="Close" onclick={onclose}><Icon name="close" size={22} /></button>
    </div>
  </div>

  <div
    class="stage"
    role="presentation"
    ontouchstart={(e) => (startX = e.touches[0].clientX)}
    ontouchend={(e) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    }}
  >
    {#key img.id}<ItemPicture url={img.url} alt={img.caption ?? ''} fit="contain" />{/key}
    {#if index > 0}
      <button type="button" class="nav prev" aria-label="Previous picture" onclick={() => go(-1)}><Icon name="back" size={26} /></button>
    {/if}
    {#if index < images.length - 1}
      <button type="button" class="nav next flip" aria-label="Next picture" onclick={() => go(1)}><Icon name="back" size={26} /></button>
    {/if}
  </div>

  <div class="caption">
    {#if editing}
      <form class="row" onsubmit={saveCaption}>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={text} placeholder="Caption" aria-label="Caption" autocomplete="off" autofocus />
        <button type="submit" class="btn small primary">Save</button>
        <button type="button" class="btn small ghost" onclick={() => (editing = false)}>Cancel</button>
      </form>
    {:else}
      <button
        type="button"
        class="cap-btn"
        onclick={() => {
          text = img.caption ?? '';
          editing = true;
        }}
      >
        {img.caption ?? 'Add a caption'} <Icon name="edit" size={14} />
      </button>
    {/if}
  </div>
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    background: #0c0e10;
    color: #eef0f2;
    padding: var(--sat) 0 env(safe-area-inset-bottom);
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
  }

  .viewer :global(.btn.ghost) {
    color: #eef0f2;
  }

  .count {
    padding-left: 0.4rem;
    opacity: 0.75;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 0 0.5rem;
  }

  .nav {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
    border: none;
    background: rgb(0 0 0 / 0.35);
    color: #fff;
    border-radius: 50%;
    width: 2.6rem;
    height: 2.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .prev {
    left: 0.5rem;
  }

  .next {
    right: 0.5rem;
  }

  .flip :global(svg) {
    transform: scaleX(-1);
  }

  .caption {
    padding: 0.6rem 1rem 0.9rem;
    text-align: center;
  }

  .caption form {
    gap: 0.4rem;
    justify-content: center;
  }

  .caption input {
    flex: 1;
    max-width: 22rem;
  }

  .cap-btn {
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    overflow-wrap: anywhere;
  }
</style>
