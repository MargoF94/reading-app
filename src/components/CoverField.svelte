<script lang="ts">
  import { isRepoCover, resizeImage } from '../lib/covers';
  import type { Item } from '../lib/types';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';

  // Cover picker: image link, or a photo (resized on the device before saving).
  let {
    item,
    coverUrl = $bindable(''),
    photo = $bindable(null),
  }: { item: Item; coverUrl: string; photo: Blob | null } = $props();

  let input: HTMLInputElement | undefined = $state();
  let error = $state('');
  let previewUrl = $state<string | undefined>(undefined);

  $effect(() => {
    if (!photo) {
      previewUrl = undefined;
      return;
    }
    const url = URL.createObjectURL(photo);
    previewUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  const shown = $derived({ ...item, coverUrl: coverUrl || undefined });

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      photo = await resizeImage(file);
    } catch {
      error = 'Couldn’t read that image. Try a JPEG or PNG.';
    } finally {
      if (input) input.value = '';
    }
  }

  function clear() {
    photo = null;
    coverUrl = '';
  }
</script>

<div class="cover-field">
  <Cover item={shown} preview={previewUrl} width={96} />
  <div class="stack controls">
    <label class="field">
      <span>Cover image link</span>
      <input
        type="url"
        value={isRepoCover(coverUrl) ? '' : coverUrl}
        placeholder={isRepoCover(coverUrl) ? 'Using your uploaded photo' : 'https://…'}
        oninput={(e) => {
          coverUrl = e.currentTarget.value;
          photo = null;
        }}
      />
    </label>
    <div class="row">
      <button type="button" class="btn small" onclick={() => input?.click()}>
        <Icon name="upload" size={16} /> Upload photo
      </button>
      {#if coverUrl || photo}
        <button type="button" class="btn small ghost danger" onclick={clear}>Remove cover</button>
      {/if}
    </div>
    {#if photo}<span class="small muted">New photo — saved when you save the book.</span>{/if}
    {#if error}<span class="small error">{error}</span>{/if}
  </div>
  <input bind:this={input} type="file" accept="image/*" hidden onchange={pick} />
</div>

<style>
  .cover-field {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .controls {
    flex: 1;
    min-width: 0;
    gap: 0.6rem;
  }

  .error {
    color: var(--danger);
  }
</style>
