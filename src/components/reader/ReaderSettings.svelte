<script lang="ts">
  import { DEFAULT_PREFS, isJapanese, PREF_LIMITS, THEME_COLORS, type ReaderPrefs } from '../../lib/reader';
  import Icon from '../Icon.svelte';

  // Text size, colours, font, line spacing, side margins and layout. Changes show at once.
  let { prefs, lang, onchange, onclose }: { prefs: ReaderPrefs; lang?: string; onchange: (p: ReaderPrefs) => void; onclose: () => void } =
    $props();

  const set = <K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) => onchange({ ...prefs, [key]: value });
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);

  const THEMES = [
    ['light', 'Light'],
    ['sepia', 'Sepia'],
    ['dark', 'Dark'],
  ] as const;
  const FONTS = [
    ['serif', 'Serif'],
    ['sans', 'Sans'],
    ['book', 'Book’s own'],
  ] as const;
  const LAYOUTS = [
    ['pages', 'Pages'],
    ['scroll', 'Scroll'],
  ] as const;
  const WRITING = [
    ['book', 'As the book'],
    ['vertical', 'Vertical'],
    ['horizontal', 'Horizontal'],
  ] as const;
</script>

<div class="sheet" role="dialog" aria-label="Reading settings">
  <div class="row head">
    <h2>Reading settings</h2>
    <button type="button" class="btn ghost icon" aria-label="Close settings" onclick={onclose}><Icon name="close" /></button>
  </div>

  <div class="grid">
    <label class="slider">
      <span class="lab">Text size <span class="val">{prefs.fontSize}%</span></span>
      <span class="track">
        <span class="a small-a" aria-hidden="true">A</span>
        <input type="range" {...PREF_LIMITS.fontSize} value={prefs.fontSize} oninput={(e) => set('fontSize', num(e))} />
        <span class="a big-a" aria-hidden="true">A</span>
      </span>
    </label>

    <label class="slider">
      <span class="lab">Line spacing <span class="val">{prefs.lineHeight.toFixed(1)}</span></span>
      <span class="track">
        <svg class="sp" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14" /></svg>
        <input
          type="range"
          {...PREF_LIMITS.lineHeight}
          value={prefs.lineHeight}
          oninput={(e) => set('lineHeight', Math.round(num(e) * 10) / 10)}
        />
        <svg class="sp" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 12h14M5 19h14" /></svg>
      </span>
    </label>

    <label class="slider">
      <span class="lab">Side margins <span class="val">{prefs.margin ? `${prefs.margin}%` : 'None'}</span></span>
      <span class="track">
        <svg class="sp" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4v16M21 4v16M6 8h12M6 12h12M6 16h12" /></svg>
        <input type="range" {...PREF_LIMITS.margin} value={prefs.margin} oninput={(e) => set('margin', num(e))} />
        <svg class="sp" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4v16M21 4v16M9 8h6M9 12h6M9 16h6" /></svg>
      </span>
    </label>
  </div>

  <div class="lab">Theme</div>
  <div class="themes" role="radiogroup" aria-label="Theme">
    {#each THEMES as [t, label] (t)}
      <button
        type="button"
        role="radio"
        aria-checked={prefs.theme === t}
        class:on={prefs.theme === t}
        style:background={THEME_COLORS[t].bg}
        style:color={THEME_COLORS[t].fg}
        onclick={() => set('theme', t)}><span class="aa">Aa</span>{label}</button
      >
    {/each}
  </div>

  <div class="lab">Font</div>
  <div class="seg" role="radiogroup" aria-label="Font">
    {#each FONTS as [f, label] (f)}
      <button type="button" role="radio" aria-checked={prefs.font === f} class:on={prefs.font === f} onclick={() => set('font', f)}>{label}</button>
    {/each}
  </div>

  <div class="lab">Layout</div>
  <div class="seg" role="radiogroup" aria-label="Layout">
    {#each LAYOUTS as [l, label] (l)}
      <button type="button" role="radio" aria-checked={prefs.layout === l} class:on={prefs.layout === l} onclick={() => set('layout', l)}>{label}</button>
    {/each}
  </div>

  {#if isJapanese(lang)}
    <div class="lab">Japanese text</div>
    <div class="seg" role="radiogroup" aria-label="Japanese text direction">
      {#each WRITING as [w, label] (w)}
        <button type="button" role="radio" aria-checked={prefs.writing === w} class:on={prefs.writing === w} onclick={() => set('writing', w)}>{label}</button>
      {/each}
    </div>
  {/if}

  <div class="row foot">
    <span class="small muted">Remembered on this device for all books.</span>
    <button type="button" class="btn ghost small" onclick={() => onchange({ ...DEFAULT_PREFS })}>Reset</button>
  </div>
</div>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 3;
    max-height: 72%;
    overflow-y: auto;
    background: var(--surface);
    color: var(--text);
    border-radius: 16px 16px 0 0;
    padding: 0.9rem 1.1rem calc(1.1rem + env(safe-area-inset-bottom));
    box-shadow: 0 -6px 24px rgb(0 0 0 / 0.2);
  }

  @media (min-width: 700px) {
    .sheet {
      left: auto;
      right: 1rem;
      bottom: 1rem;
      width: 380px;
      border-radius: 14px;
    }
  }

  .head {
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 1.2rem;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .lab {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-2);
    margin: 0.75rem 0 0.35rem;
  }

  .val {
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .slider {
    display: block;
  }

  .track {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .track input {
    flex: 1;
    accent-color: var(--accent);
    min-width: 0;
  }

  .a {
    font-family: var(--font-serif);
    width: 1.3rem;
    text-align: center;
  }

  .small-a {
    font-size: 0.85rem;
  }

  .big-a {
    font-size: 1.45rem;
  }

  .sp {
    width: 1.3rem;
    height: 1.3rem;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .themes {
    display: flex;
    gap: 0.6rem;
  }

  .themes button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.5rem 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .themes .aa {
    font-family: var(--font-serif);
    font-size: 1.2rem;
  }

  .themes button.on {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .seg {
    display: flex;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 2px;
  }

  .seg button {
    flex: 1;
    border: none;
    background: none;
    font: inherit;
    font-size: 0.88rem;
    padding: 0.45em 0.3em;
    border-radius: 5px;
    color: var(--text-2);
    cursor: pointer;
  }

  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow);
  }

  .foot {
    justify-content: space-between;
    margin-top: 0.9rem;
    gap: 0.5rem;
  }
</style>
