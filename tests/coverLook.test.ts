import { describe, expect, it } from 'vitest';
import { colourfulness, filmPixels, grainPixels, type Pixels } from '../src/lib/coverLook';

/** A picture filled with one colour, or a left-to-right grey ramp. */
function pixels(w: number, h: number, colour?: [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = colour ?? [Math.round((x / (w - 1)) * 255), Math.round((x / (w - 1)) * 255), Math.round((x / (w - 1)) * 255)];
      data.set([r, g, b, 255], i);
    }
  }
  return { data, width: w, height: h };
}

const mean = (px: Pixels, ch: number) => {
  let s = 0;
  for (let i = ch; i < px.data.length; i += 4) s += px.data[i];
  return s / (px.data.length / 4);
};

describe('cover picture looks', () => {
  it('tells colour pictures from black-and-white ones', () => {
    expect(colourfulness(pixels(40, 30))).toBe(0);
    expect(colourfulness(pixels(40, 30, [200, 40, 40]))).toBeGreaterThan(0.5);
  });

  it('keeps black-and-white pictures black and white', () => {
    const px = pixels(64, 48);
    filmPixels(px, 1);
    for (let i = 0; i < px.data.length; i += 4) {
      expect(px.data[i]).toBe(px.data[i + 1]);
      expect(px.data[i + 1]).toBe(px.data[i + 2]);
    }
    // Deeper shadows; whites rolled off a little.
    expect(px.data[(10 * 64 + 12) * 4]).toBeLessThan(48);
    expect(px.data[(10 * 64 + 63) * 4]).toBeLessThan(255);
  });

  it('turns colour pictures’ shadows towards navy, and mutes blues', () => {
    // A colour picture: red on the left, dark grey on the right.
    const px = pixels(128, 64, [40, 40, 40]);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 48; x++) px.data.set([200, 60, 40], (y * 128 + x) * 4);
    filmPixels(px, 1);
    const grey = px.data.subarray((32 * 128 + 120) * 4); // well away from the red
    expect(grey[2]).toBeGreaterThan(grey[0] + 6);

    // How much colour: the gap between the strongest and weakest channel.
    const chroma = (p: Pixels) => Math.max(p.data[0], p.data[1], p.data[2]) - Math.min(p.data[0], p.data[1], p.data[2]);
    const blue = pixels(32, 32, [40, 90, 200]);
    const before = chroma(blue);
    filmPixels(blue, 1);
    expect(chroma(blue)).toBeLessThan(before * 0.7);
  });

  it('does nothing at 0', () => {
    const px = pixels(16, 16, [120, 80, 60]);
    const copy = px.data.slice();
    filmPixels(px, 0);
    grainPixels(px, 0);
    expect(px.data).toEqual(copy);
  });

  it('adds the same grain every time, even in the shadows, without changing the overall light', () => {
    const a = pixels(120, 90, [128, 128, 128]);
    const b = pixels(120, 90, [128, 128, 128]);
    grainPixels(a, 0.5);
    grainPixels(b, 0.5);
    expect(a.data).toEqual(b.data); // no flicker as the picture moves
    expect(Math.abs(mean(a, 0) - 128)).toBeLessThan(1.5);
    let spread = 0;
    for (let i = 0; i < a.data.length; i += 4) spread += (a.data[i] - 128) ** 2;
    expect(Math.sqrt(spread / (a.data.length / 4))).toBeGreaterThan(4);
    // Grain is grey: the same change in each channel.
    for (let i = 0; i < a.data.length; i += 4) expect(a.data[i]).toBe(a.data[i + 2]);
    const dark = pixels(120, 90, [12, 12, 12]);
    grainPixels(dark, 0.5);
    let changed = 0;
    for (let i = 0; i < dark.data.length; i += 4) if (dark.data[i] !== 12) changed++;
    expect(changed / (dark.data.length / 4)).toBeGreaterThan(0.5);
  });
});
