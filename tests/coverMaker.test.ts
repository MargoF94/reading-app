import { describe, expect, it } from 'vitest';
import { bandLayout, COVER_H, COVER_W, dragFocus, pictureArea, pictureCrop, trackedWidth, wrapTracked } from '../src/lib/coverMaker';

// Every character 10 px wide.
const m = { measureText: (t: string) => ({ width: [...t].length * 10 }) };

describe('cover maker layout', () => {
  it('has Penguin Classics proportions with the picture on top', () => {
    expect(COVER_H / COVER_W).toBeCloseTo(1.53, 2);
    expect(pictureArea()).toEqual({ width: 1200, height: 1273 });
  });

  it('spaces letters out and wraps whole words', () => {
    expect(trackedWidth(m, 'ABC', 5)).toBe(40);
    expect(trackedWidth(m, '', 5)).toBe(0);
    // "WHERE YOU GO, I GO": 18 letters with spacing 2 = 214 px.
    expect(wrapTracked(m, 'WHERE YOU GO, I GO', 300, 2)).toEqual(['WHERE YOU GO, I GO']);
    expect(wrapTracked(m, 'WHERE YOU GO, I GO', 150, 2)).toEqual(['WHERE YOU', 'GO, I GO']);
    // A word longer than the line keeps its own line.
    expect(wrapTracked(m, 'SUPERCALIFRAGILISTIC IS LONG', 100, 0)).toEqual(['SUPERCALIFRAGILISTIC', 'IS LONG']);
  });

  it('puts the band’s words either side of the penguin, the same distance from it', () => {
    const classic = bandLayout(m, 'Penguin Classics');
    expect(classic).toMatchObject({ left: 'PENGUIN', right: 'CLASSICS', size: 23, tracking: 23 });
    expect(classic.gap).toBeCloseTo(79.2);
    expect(bandLayout(m, 'Archive of Our Own')).toMatchObject({ left: 'ARCHIVE', right: 'OF OUR OWN', size: 23, tracking: 23 });
  });

  it('keeps long band words clear of the penguin and the edges', () => {
    const room = COVER_W / 2 - 79.2 - COVER_W * 0.04;
    const width = (b: ReturnType<typeof bandLayout>, side: string) =>
      trackedWidth(m, side, 0) * (b.size / 23) + b.tracking * ([...side].length - 1);
    // Closer letters first…
    const longer = bandLayout(m, 'Archive of Our Own Fanworks');
    expect(longer.size).toBe(23);
    expect(longer.tracking).toBeLessThan(23);
    expect(width(longer, longer.right)).toBeCloseTo(room);
    // …then smaller ones.
    const longest = bandLayout(m, 'Penguin Modern Classics Collection Edition Volume One');
    expect(longest.size).toBeLessThan(23);
    expect(longest.tracking / longest.size).toBeCloseTo(0.3);
    expect(width(longest, longest.right)).toBeLessThanOrEqual(room + 0.001);
    expect(width(longest, longest.left)).toBeLessThan(room);
  });

  it('crops the picture around its focus, filling the area', () => {
    const area = pictureArea();
    const square = { width: 1000, height: 1000 };
    const c = pictureCrop(square, area, { x: 0.5, y: 0.5 }, 1);
    expect(c.sh).toBeCloseTo(1000);
    expect(c.sw).toBeCloseTo((1000 * 1200) / 1273);
    expect(c.sx).toBeCloseTo((1000 - c.sw) / 2);
    // Never past the picture's edges, and zoom shows less of it.
    expect(pictureCrop(square, area, { x: 0, y: 0 }, 1).sx).toBe(0);
    expect(pictureCrop(square, area, { x: 0.5, y: 0.5 }, 2).sh).toBeCloseTo(500);
  });

  it('moves the picture with a drag, only as far as it goes', () => {
    const tall = { width: 1000, height: 3000 };
    const f = dragFocus(tall, { x: 0.5, y: 0.5 }, 1, 0, 100); // drag down: see more of the top
    expect(f.y).toBeLessThan(0.5);
    expect(f.x).toBe(0.5); // already as wide as the picture
    const top = dragFocus(tall, { x: 0.5, y: 0.5 }, 1, 0, 100_000);
    const crop = pictureCrop(tall, pictureArea(), top, 1);
    expect(crop.sy).toBe(0);
    expect(top.y).toBeCloseTo(crop.sh / 3000 / 2);
  });
});
