<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { coverJpeg, DEFAULT_SERIES, dragFocus, drawCover, loadCoverFonts, type CoverDesign } from '../lib/coverMaker';
  import { COVER_W } from '../lib/coverMaker';
  import { library } from '../lib/store.svelte';
  import type { Item } from '../lib/types';
  import Icon from './Icon.svelte';

  // A Penguin Classics–style cover from a picture (as penguin.jos.ht makes): the title in
  // orange capitals, the author in white italics. Drag the picture to choose what shows.
  let {
    item,
    busy = false,
    options,
    onuse,
    oncancel,
  }: { item: Item; busy?: boolean; options?: Snippet; onuse: (cover: Blob) => void; oncancel: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let title = $state(item.title);
  // svelte-ignore state_referenced_locally
  let author = $state(library.authorNames(item));
  let series = $state(DEFAULT_SERIES);
  let picture = $state.raw<ImageBitmap | null>(null);
  let focus = $state.raw({ x: 0.5, y: 0.5 });
  let zoom = $state(1);
  let fontsReady = $state(false);
  let making = $state(false);
  let error = $state('');
  let canvas: HTMLCanvasElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  const design = $derived<CoverDesign>({ picture, title, author, series, focus, zoom });

  onMount(() => {
    void loadCoverFonts().then(() => (fontsReady = true));
    return () => picture?.close();
  });

  // Redraw the preview on any change (once a frame).
  $effect(() => {
    void fontsReady;
    const d = design;
    const c = canvas;
    if (!c) return;
    const frame = requestAnimationFrame(() => drawCover(c, d));
    return () => cancelAnimationFrame(frame);
  });

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    try {
      const next = await createImageBitmap(file);
      picture?.close();
      picture = next;
      focus = { x: 0.5, y: 0.5 };
      zoom = 1;
      error = '';
    } catch {
      error = 'Couldn’t read that picture. Try a JPEG or PNG.';
    }
  }

  // ---- dragging the picture ----

  let drag: { x: number; y: number } | null = null;

  function down(e: PointerEvent) {
    if (!picture || !canvas) return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!drag || !picture || !canvas) return;
    const k = COVER_W / canvas.getBoundingClientRect().width; // cover pixels per screen pixel
    focus = dragFocus(picture, focus, zoom, (e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
    drag = { x: e.clientX, y: e.clientY };
  }

  function up() {
    drag = null;
  }

  async function use() {
    if (!picture) return;
    making = true;
    try {
      onuse(await coverJpeg($state.snapshot(design) as CoverDesign));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      making = false;
    }
  }
</script>

<div class="maker stack">
  <canvas
    bind:this={canvas}
    class:movable={!!picture}
    aria-label="Cover preview"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  ></canvas>

  {#if picture}
    <p class="small muted hint">Drag the picture to choose what shows.</p>
    <label class="field zoom">
      <span>Zoom</span>
      <input type="range" min="1" max="3" step="0.01" bind:value={zoom} />
    </label>
  {/if}
  <button type="button" class="btn" class:primary={!picture} onclick={() => fileInput?.click()}>
    <Icon name="image" size={18} />
    {picture ? 'Choose another picture' : 'Choose a picture'}
  </button>

  <label class="field">
    <span>Title <span class="muted">(orange capitals)</span></span>
    <input bind:value={title} />
  </label>
  <label class="field">
    <span>Author <span class="muted">(white italics)</span></span>
    <input bind:value={author} />
  </label>
  <label class="field">
    <span>White band</span>
    <input bind:value={series} />
  </label>

  {@render options?.()}
  {#if error}<p class="small error" role="alert">{error}</p>{/if}

  <div class="row end">
    <button type="button" class="btn ghost" disabled={busy || making} onclick={oncancel}>Back</button>
    <button type="button" class="btn primary" disabled={!picture || busy || making} onclick={use}>
      {busy || making ? 'Saving…' : 'Use this cover'}
    </button>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={pick} />
</div>

<style>
  canvas {
    display: block;
    width: min(100%, 300px);
    aspect-ratio: 1200 / 1836;
    margin: 0 auto;
    border-radius: 3px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.25);
    touch-action: none;
  }

  canvas.movable {
    cursor: grab;
  }

  .hint {
    text-align: center;
    margin: -0.2rem 0 0;
  }

  .zoom input {
    padding: 0;
    border: none;
    min-height: 32px;
    accent-color: var(--accent);
  }

  .end {
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }
</style>
