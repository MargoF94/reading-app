// Penguin Classics–style covers from a picture, as penguin.jos.ht makes them: the picture
// on top, a white band with the series name either side of a penguin, and a black band with
// the title in orange spaced capitals and the author in white italics. Sizes and places were
// measured from that site's covers; the fonts are free look-alikes (Jost, EB Garamond).

export const COVER_W = 1200;
export const COVER_H = 1836;

/** Shares of the cover, and type sizes at 1200 px wide. */
const L = {
  picture: 0.6933, // of the height
  band: 0.0487, // of the height
  titleBaseline: 0.17, // below the black band's top, of the width
  authorBaseline: 0.261,
  titleSize: 56,
  titleTracking: 0.17, // em
  minTitleSize: 36,
  authorSize: 58,
  minAuthorSize: 34,
  bandSize: 23,
  bandTracking: 1, // em
  textWidth: 0.84, // of the width
  orange: '#e8702a',
  bandOrange: '#ff6600',
};

const SANS = '"Cover Sans", "Helvetica Neue", Arial, sans-serif';
const SERIF = '"Cover Serif", Garamond, Georgia, serif';

export interface CoverDesign {
  picture: ImageBitmap | HTMLCanvasElement | HTMLImageElement | null;
  /** In orange capitals (penguin.jos.ht's "Author" box). */
  title: string;
  /** In white italics (penguin.jos.ht's "Title" box). */
  author: string;
  /** Either side of the penguin. */
  series: string;
  /** The point of the picture at the middle of its area, 0–1 each way. */
  focus: { x: number; y: number };
  /** 1: the picture just fills its area. */
  zoom: number;
}

export const DEFAULT_SERIES = 'Penguin Classics';

// ---- fonts ----

const RANGES = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
  'cyrillic-ext': 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F',
} as const;

const FACES: readonly (readonly [family: string, file: string, weight: string, style: string, range: keyof typeof RANGES])[] = [
  ...(['latin', 'latin-ext', 'cyrillic'] as const).flatMap((r) => [
    ['Cover Sans', `jost-${r}-400-normal.woff2`, '400', 'normal', r] as const,
    ['Cover Sans', `jost-${r}-600-normal.woff2`, '600', 'normal', r] as const,
  ]),
  ...(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'] as const).map(
    (r) => ['Cover Serif', `eb-garamond-${r}-600-italic.woff2`, '600', 'italic', r] as const,
  ),
];

let fonts: Promise<void> | null = null;

/** Loads the cover fonts (once). Covers drawn before they arrive use similar system fonts. */
export function loadCoverFonts(): Promise<void> {
  fonts ??= Promise.all(
    FACES.map(([family, file, weight, style, range]) => {
      const face = new FontFace(family, `url(${new URL(`fonts/${file}`, document.baseURI).href})`, {
        weight,
        style,
        unicodeRange: RANGES[range],
      });
      document.fonts.add(face);
      return face.load().catch(() => face);
    }),
  ).then(() => {});
  return fonts;
}

// ---- layout ----

export interface Measure {
  measureText(text: string): { width: number };
}

/** Width of text drawn with `tracking` px between letters. */
export function trackedWidth(m: Measure, text: string, tracking: number): number {
  const chars = [...text];
  return chars.reduce((a, c) => a + m.measureText(c).width, 0) + tracking * Math.max(0, chars.length - 1);
}

/** Text broken into lines no wider than `max`. */
export function wrapTracked(m: Measure, text: string, max: number, tracking: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && trackedWidth(m, next, tracking) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The part of the picture shown (source rectangle), keeping `focus` in the middle where it can. */
export function pictureCrop(
  pic: { width: number; height: number },
  area: { width: number; height: number },
  focus: { x: number; y: number },
  zoom: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(area.width / pic.width, area.height / pic.height) * Math.max(1, zoom);
  const sw = area.width / scale;
  const sh = area.height / scale;
  const sx = Math.min(pic.width - sw, Math.max(0, focus.x * pic.width - sw / 2));
  const sy = Math.min(pic.height - sh, Math.max(0, focus.y * pic.height - sh / 2));
  return { sx, sy, sw, sh };
}

/** The focus after dragging the picture by (dx, dy) cover pixels, kept where the picture still fills its area. */
export function dragFocus(
  pic: { width: number; height: number },
  focus: { x: number; y: number },
  zoom: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const area = pictureArea();
  const { sw, sh } = pictureCrop(pic, area, focus, zoom);
  const perPx = sw / area.width; // picture pixels per cover pixel
  const clamp = (v: number, half: number) => Math.min(1 - half, Math.max(half, v));
  return {
    x: clamp(focus.x - (dx * perPx) / pic.width, sw / pic.width / 2),
    y: clamp(focus.y - (dy * perPx) / pic.height, sh / pic.height / 2),
  };
}

export const pictureArea = () => ({ width: COVER_W, height: Math.round(COVER_H * L.picture) });

// ---- drawing ----

function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cx = x - trackedWidth(ctx, text, tracking) / 2;
  for (const c of text) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + tracking;
  }
}

/** A simple penguin in an orange oval (drawn here, not Penguin's own artwork). */
function emblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(w / 100, h / 130);
  ctx.beginPath();
  ctx.ellipse(0, 0, 47, 62, 0, 0, Math.PI * 2);
  ctx.fillStyle = L.bandOrange;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  // body, facing right
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(4, -50);
  ctx.bezierCurveTo(16, -50, 22, -40, 20, -32);
  ctx.lineTo(31, -27);
  ctx.lineTo(18, -24);
  ctx.bezierCurveTo(26, -6, 30, 18, 26, 38);
  ctx.lineTo(30, 46);
  ctx.lineTo(12, 46);
  ctx.lineTo(8, 41);
  ctx.lineTo(-8, 41);
  ctx.lineTo(-12, 46);
  ctx.lineTo(-30, 46);
  ctx.lineTo(-24, 36);
  ctx.bezierCurveTo(-32, 12, -26, -14, -14, -28);
  ctx.bezierCurveTo(-12, -42, -6, -50, 4, -50);
  ctx.fill();
  // belly and face
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(10, -34);
  ctx.bezierCurveTo(16, -30, 16, -24, 12, -20);
  ctx.bezierCurveTo(22, -2, 22, 22, 16, 38);
  ctx.lineTo(-10, 38);
  ctx.bezierCurveTo(-18, 18, -16, -6, -4, -22);
  ctx.bezierCurveTo(0, -30, 4, -34, 10, -34);
  ctx.fill();
  // eye and flipper
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(9, -38, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-14, -14);
  ctx.bezierCurveTo(-26, 0, -28, 16, -24, 28);
  ctx.bezierCurveTo(-18, 14, -14, 2, -10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws the cover at full size (COVER_W × COVER_H) onto the canvas. */
export function drawCover(canvas: HTMLCanvasElement, d: CoverDesign): void {
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext('2d')!;
  const area = pictureArea();
  const bandH = Math.round(COVER_H * L.band);
  const blackTop = area.height + bandH;

  // The picture (orange until one is chosen, as on penguin.jos.ht).
  ctx.fillStyle = L.bandOrange;
  ctx.fillRect(0, 0, COVER_W, area.height);
  if (d.picture) {
    const { sx, sy, sw, sh } = pictureCrop(d.picture, area, d.focus, d.zoom);
    ctx.drawImage(d.picture, sx, sy, sw, sh, 0, 0, area.width, area.height);
  }

  // White band: the series name either side of the penguin.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, area.height, COVER_W, bandH);
  ctx.fillStyle = '#000';
  ctx.font = `600 ${L.bandSize}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  const bandBase = area.height + bandH / 2 + (L.bandSize * 0.7) / 2;
  const [left = '', ...rest] = d.series.toUpperCase().trim().split(/\s+/);
  drawTracked(ctx, left, COVER_W * 0.319, bandBase, L.bandSize * L.bandTracking);
  drawTracked(ctx, rest.join(' '), COVER_W * 0.679, bandBase, L.bandSize * L.bandTracking);
  emblem(ctx, COVER_W / 2, area.height + bandH / 2, COVER_W * 0.039, bandH * 0.68);

  // Black band: the title in orange spaced capitals (three lines at most, smaller if need be)…
  ctx.fillStyle = '#000';
  ctx.fillRect(0, blackTop, COVER_W, COVER_H - blackTop);
  const max = COVER_W * L.textWidth;
  const title = d.title.trim().toUpperCase();
  let size = L.titleSize;
  let lines: string[];
  for (;;) {
    ctx.font = `400 ${size}px ${SANS}`;
    lines = wrapTracked(ctx, title, max, size * L.titleTracking);
    const widest = Math.max(0, ...lines.map((l) => trackedWidth(ctx, l, size * L.titleTracking)));
    if ((lines.length <= 3 && widest <= max) || size <= L.minTitleSize) break;
    size -= 2;
  }
  const gap = size * 1.25;
  const extra = (lines.length - 1) * gap;
  let y = blackTop + COVER_W * L.titleBaseline - extra * 0.6;
  ctx.fillStyle = L.orange;
  for (const line of lines) {
    drawTracked(ctx, line, COVER_W / 2, y, size * L.titleTracking);
    y += gap;
  }

  // …and the author in white italics.
  const author = d.author.trim();
  let aSize = L.authorSize;
  ctx.font = `italic 600 ${aSize}px ${SERIF}`;
  while (ctx.measureText(author).width > max && aSize > L.minAuthorSize) {
    aSize -= 2;
    ctx.font = `italic 600 ${aSize}px ${SERIF}`;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(author, COVER_W / 2, blackTop + COVER_W * L.authorBaseline + extra * 0.4, max);
  ctx.textAlign = 'left';
}

/** The finished cover as a JPEG (what EPUBs and Kindles take). */
export async function coverJpeg(d: CoverDesign): Promise<Blob> {
  await loadCoverFonts();
  const canvas = document.createElement('canvas');
  drawCover(canvas, d);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Couldn’t make the cover image.');
  return blob;
}
