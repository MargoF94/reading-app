<script lang="ts">
  import { parseIsbn } from '../lib/isbn';
  import { getDetector, type Detector } from '../lib/scanner';
  import Modal from './Modal.svelte';

  // Reads an ISBN barcode with the camera (or from a photo) and hands it back.
  let { open, onclose, onresult }: { open: boolean; onclose: () => void; onresult: (isbn13: string) => void } = $props();

  let video: HTMLVideoElement | undefined = $state();
  let message = $state('Starting the camera…');
  let fileInput: HTMLInputElement | undefined = $state();

  function isbnFrom(codes: { rawValue: string }[]): string | undefined {
    for (const c of codes) {
      const isbn = parseIsbn(c.rawValue);
      if (isbn) return isbn.isbn13;
    }
    return undefined;
  }

  $effect(() => {
    if (!open || !video) return;
    const el = video;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    (async () => {
      let detector: Detector;
      try {
        detector = await getDetector();
      } catch {
        message = 'Barcode reading isn’t available in this browser. Type the ISBN instead.';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch {
        message = 'No camera access. Allow the camera for this site, or take a photo of the barcode instead.';
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      el.srcObject = stream;
      await el.play().catch(() => {});
      message = 'Point the camera at the barcode on the back cover.';
      const tick = async () => {
        if (stopped) return;
        try {
          if (el.readyState >= 2) {
            const isbn = isbnFrom(await detector.detect(el));
            if (isbn) {
              onresult(isbn);
              return;
            }
          }
        } catch {
          /* keep trying */
        }
        timer = setTimeout(tick, 250);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  });

  async function fromPhoto(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const detector = await getDetector();
      const isbn = isbnFrom(await detector.detect(await createImageBitmap(file)));
      if (isbn) onresult(isbn);
      else message = 'No ISBN barcode found in that photo. Try again closer, with good light.';
    } catch {
      message = 'Couldn’t read that photo.';
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<Modal {open} title="Scan ISBN barcode" {onclose}>
  <div class="stack">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted></video>
    <p class="small muted" role="status">{message}</p>
    <div>
      <button type="button" class="btn small" onclick={() => fileInput?.click()}>Use a photo instead</button>
    </div>
    <input bind:this={fileInput} type="file" accept="image/*" capture="environment" hidden onchange={fromPhoto} />
  </div>
</Modal>

<style>
  video {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: #000;
    border-radius: var(--radius-sm);
  }

  p {
    margin: 0;
  }
</style>
