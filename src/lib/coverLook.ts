// Film looks for a cover's picture, modelled on pictures edited for covers here: colour film
// (deep navy shadows, muted blues, warm skin, a little green in the light, a soft haze and a
// glow round bright lights) and film grain ("noise": soft, fine, blotchy, in the shadows too).

export interface Look {
  /** 0–1: how much of the film look. */
  film: number;
  /** 0–1: how much grain. */
  noise: number;
}

/** Pixels, as in canvas ImageData. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// ---- film ----

/** Tone curve per channel: deeper shadows, more contrast, blacks a touch lifted, whites rolled off. */
function toneCurve(f: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const s = 0.62 * f; // S-curve
  const gamma = 1 + 0.22 * f; // darker mid-tones
  const black = 0.02 * f;
  const white = 1 - 0.07 * f;
  for (let i = 0; i < 256; i++) {
    const x = Math.pow(i / 255, gamma);
    const y = x - (s * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
    lut[i] = Math.round((black + y * (white - black)) * 255);
  }
  return lut;
}

/** The film look (all but the darker corners, which go with the cover's picture area), in place. */
export function filmPixels(px: Pixels, f: number): void {
  f = Math.min(1, Math.max(0, f));
  if (!f) return;
  const { data, width: w, height: h } = px;
  const soft = blurred(px);
  const sw = soft.width;
  const lut = toneCurve(f);
  // Black-and-white pictures stay black and white: colour casts only as far as there's colour.
  const tint = f * Math.min(1, colourfulness(px) / 0.08);
  for (let y = 0; y < h; y++) {
    // The blurred copy is a quarter of the size: read it smoothly (bilinear).
    const sy = Math.min(soft.height - 1.001, Math.max(0, (y + 0.5) / 4 - 0.5));
    const sy0 = Math.floor(sy);
    const ty = sy - sy0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sx = Math.min(sw - 1.001, Math.max(0, (x + 0.5) / 4 - 0.5));
      const sx0 = Math.floor(sx);
      const tx = sx - sx0;
      const k = (sy0 * sw + sx0) * 4;
      const k2 = k + sw * 4;
      const a = (1 - tx) * (1 - ty);
      const bq = tx * (1 - ty);
      const c = (1 - tx) * ty;
      const d = tx * ty;
      const v = soft.data;
      const br = a * v[k] + bq * v[k + 4] + c * v[k2] + d * v[k2 + 4];
      const bg = a * v[k + 1] + bq * v[k + 5] + c * v[k2 + 1] + d * v[k2 + 5];
      const bb = a * v[k + 2] + bq * v[k + 6] + c * v[k2 + 2] + d * v[k2 + 6];
      const glow = a * v[k + 3] + bq * v[k + 7] + c * v[k2 + 3] + d * v[k2 + 7];

      // A soft haze: some of the blurred picture over the sharp one.
      const haze = 0.14 * f;
      let r = data[i] * (1 - haze) + br * haze;
      let g = data[i + 1] * (1 - haze) + bg * haze;
      let b = data[i + 2] * (1 - haze) + bb * haze;

      // Glow round bright lights, warm like film's halation (screen blend).
      const halo = 0.6 * f * glow;
      if (halo > 0.002) {
        const warm = tint / Math.max(f, 1e-6);
        r = 255 - (255 - r) * (1 - halo);
        g = 255 - (255 - g) * (1 - halo * (1 - 0.45 * warm));
        b = 255 - (255 - b) * (1 - halo * (1 - 0.6 * warm));
      }

      // Less colour, blues most of all (they turn a muted teal on film).
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const blue = Math.min(1, Math.max(0, (b - (r + g) / 2) / 90));
      const sat = 1 - tint * (0.2 + 0.34 * blue);
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;

      // Shadows towards navy, mid-tones (skin) warmer, the light a touch green.
      const t = l / 255;
      const shadow = (1 - t) * (1 - t) * tint;
      const mid = 4 * t * (1 - t) * tint;
      const light = t * t * tint;
      r += -22 * shadow + 8 * mid;
      g += -7 * shadow + 2 * mid + 6 * light;
      b += 20 * shadow - 8 * mid - 2 * light;

      data[i] = lut[clamp(r)];
      data[i + 1] = lut[clamp(g)];
      data[i + 2] = lut[clamp(b)];
    }
  }
}

/** How colourful the picture is: its average saturation (0 for black and white), from a sample of pixels. */
export function colourfulness(px: Pixels): number {
  const { data } = px;
  const step = Math.max(4, Math.floor(data.length / 4 / 20000)) * 4;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    sum += max ? (max - min) / max : 0;
    n++;
  }
  return n ? sum / n : 0;
}

/** The picture blurred at a quarter of its size (RGB), with how much each part glows (A, 0–1). */
function blurred(px: Pixels): { data: Float32Array; width: number; height: number } {
  const { data, width: w, height: h } = px;
  const sw = Math.ceil(w / 4) + 1;
  const sh = Math.ceil(h / 4) + 1;
  const out = new Float32Array(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      // Average of the 4×4 block (sampled), and its brightest point for the glow.
      let r = 0;
      let g = 0;
      let b = 0;
      let peak = 0;
      for (let dy = 0; dy < 4; dy += 2) {
        for (let dx = 0; dx < 4; dx += 2) {
          const i = (Math.min(h - 1, y * 4 + dy) * w + Math.min(w - 1, x * 4 + dx)) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          peak = Math.max(peak, data[i], data[i + 1], data[i + 2]);
        }
      }
      const o = (y * sw + x) * 4;
      out[o] = r / 4;
      out[o + 1] = g / 4;
      out[o + 2] = b / 4;
      const e = Math.max(0, (peak / 255 - 0.8) / 0.2);
      out[o + 3] = e * e;
    }
  }
  const radius = Math.max(2, Math.round(Math.min(w, h) / 220));
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(out, sw, sh, radius, true);
    boxBlur(out, sw, sh, radius, false);
  }
  return { data: out, width: sw, height: sh };
}

/** One box-blur pass of 4-channel values, along rows or columns (running sums). */
function boxBlur(a: Float32Array, w: number, h: number, r: number, rows: boolean): void {
  const n = rows ? w : h;
  const lines = rows ? h : w;
  const step = (rows ? 1 : w) * 4;
  const line = new Float32Array(n * 4);
  const span = 2 * r + 1;
  for (let j = 0; j < lines; j++) {
    const start = (rows ? j * w : j) * 4;
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 4; ch++) line[i * 4 + ch] = a[start + i * step + ch];
    for (let ch = 0; ch < 4; ch++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += line[Math.min(n - 1, Math.max(0, i)) * 4 + ch];
      for (let i = 0; i < n; i++) {
        a[start + i * step + ch] = sum / span;
        sum += line[Math.min(n - 1, i + r + 1) * 4 + ch] - line[Math.max(0, i - r) * 4 + ch];
      }
    }
  }
}

// ---- grain ----

let grainCache: { width: number; height: number; noise: Float32Array } | undefined;

/** Film grain: the same pattern every time (so it doesn't flicker as the picture moves). */
function grainPattern(w: number, h: number): Float32Array {
  if (grainCache && grainCache.width === w && grainCache.height === h) return grainCache.noise;
  const rand = mulberry32(0x5eed);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.7; // about normal, spread 1
  // Blotches: noise at a third of the size and a half, read smoothly, plus a little single-pixel grain.
  const layer = (scale: number) => {
    const lw = Math.ceil(w / scale) + 2;
    const lh = Math.ceil(h / scale) + 2;
    const v = new Float32Array(lw * lh);
    for (let i = 0; i < v.length; i++) v[i] = gauss();
    return { v, lw, scale };
  };
  const layers = [
    { ...layer(1.6), weight: 0.75 },
    { ...layer(3.2), weight: 0.4 },
  ];
  const noise = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0.28 * gauss();
      for (const { v, lw, scale, weight } of layers) {
        const cx = x / scale;
        const cy = y / scale;
        const x0 = Math.floor(cx);
        const y0 = Math.floor(cy);
        const tx = cx - x0;
        const ty = cy - y0;
        const k = y0 * lw + x0;
        n += weight * ((v[k] * (1 - tx) + v[k + 1] * tx) * (1 - ty) + (v[k + lw] * (1 - tx) + v[k + lw + 1] * tx) * ty);
      }
      noise[y * w + x] = n;
    }
  }
  grainCache = { width: w, height: h, noise };
  return noise;
}

/** Film grain over the pixels, in place. */
export function grainPixels(px: Pixels, amount: number): void {
  amount = Math.min(1, Math.max(0, amount));
  if (!amount) return;
  const { data, width: w, height: h } = px;
  const noise = grainPattern(w, h);
  const spread = 20 * amount;
  for (let p = 0, i = 0; p < noise.length; p++, i += 4) {
    const t = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    // Strongest in the mid-tones, still there in the shadows and the light.
    const delta = noise[p] * spread * (0.5 + 2 * t * (1 - t));
    data[i] = clamp(data[i] + delta);
    data[i + 1] = clamp(data[i + 1] + delta);
    data[i + 2] = clamp(data[i + 2] + delta);
  }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v + 0.5) | 0;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
