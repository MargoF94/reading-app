<script lang="ts">
  // Half-star rating. Read-only unless `onchange` is given.
  // Tap/click a star half to rate; tap the current rating again to clear.
  let {
    value,
    onchange,
    size = 22,
  }: { value: number | undefined; onchange?: (v: number | undefined) => void; size?: number } = $props();

  let hover = $state<number | undefined>(undefined);
  const shown = $derived(hover ?? value ?? 0);
  let el: HTMLDivElement | undefined = $state();

  function valueAt(e: PointerEvent): number {
    const rect = el!.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return Math.max(0.5, Math.ceil((x / rect.width) * 10) / 2);
  }

  function click(e: PointerEvent) {
    if (!onchange) return;
    const v = valueAt(e);
    onchange(v === value ? undefined : v);
    hover = undefined;
  }

  function fill(i: number): number {
    return Math.max(0, Math.min(1, shown - i));
  }
</script>

<div class="rating" class:interactive={!!onchange}>
  <div
    class="stars"
    bind:this={el}
    role="presentation"
    onpointerup={click}
    onpointermove={(e) => onchange && e.pointerType === 'mouse' && (hover = valueAt(e))}
    onpointerleave={() => (hover = undefined)}
  >
    {#each [0, 1, 2, 3, 4] as i (i)}
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <clipPath id="c{i}-{size}-{fill(i)}">
            <rect x="0" y="0" width={24 * fill(i)} height="24" />
          </clipPath>
        </defs>
        <path class="empty" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
        <path
          class="full"
          clip-path="url(#c{i}-{size}-{fill(i)})"
          d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"
        />
      </svg>
    {/each}
  </div>
  {#if onchange}
    <input
      class="visually-hidden"
      type="range"
      min="0"
      max="5"
      step="0.5"
      value={value ?? 0}
      aria-label="Rating"
      aria-valuetext={value ? `${value} stars` : 'Not rated'}
      oninput={(e) => {
        const v = Number(e.currentTarget.value);
        onchange(v === 0 ? undefined : v);
      }}
    />
  {:else}
    <span class="visually-hidden">{value ? `${value} out of 5 stars` : 'Not rated'}</span>
  {/if}
</div>

<style>
  .rating {
    display: inline-flex;
    align-items: center;
    position: relative;
  }

  .stars {
    display: inline-flex;
    gap: 1px;
    touch-action: manipulation;
  }

  .interactive .stars {
    cursor: pointer;
    padding: 4px 0;
  }

  .empty {
    fill: none;
    stroke: var(--star);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .full {
    fill: var(--star);
    stroke: var(--star);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .rating:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
</style>
