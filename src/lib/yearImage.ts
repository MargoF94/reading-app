// Renders a shareable "Year in books" image (1080×1350 PNG) in the current theme.
import { coverSrc } from './covers';
import type { Stats } from './stats';
import { compact } from './stats';
import type { Item } from './types';
import { hashHue } from './util';

const W = 1080;
const H = 1350;
const PAD = 60;

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  // Split on spaces, or per character for scripts without spaces (Japanese).
  const words = /\s/.test(text) ? text.split(/\s+/) : [...text];
  const sep = /\s/.test(text) ? ' ' : '';
  let line = '';
  for (const w of words) {
    const next = line ? line + sep + w : w;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(sep) !== lines.join(sep)) lines[maxLines - 1] += '…';
  return lines;
}

/** Loads a cover without tainting the canvas; undefined if it can't be read. */
async function loadCover(item: Item): Promise<ImageBitmap | undefined> {
  if (!item.coverUrl) return undefined;
  try {
    const src = await coverSrc(item.coverUrl);
    if (!src) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(src, { signal: ctrl.signal, mode: 'cors' }).finally(() => clearTimeout(timer));
    if (!res.ok) return undefined;
    return await createImageBitmap(await res.blob());
  } catch {
    return undefined; // no CORS access, offline, or not an image
  }
}

async function loadAll(items: Item[]): Promise<(ImageBitmap | undefined)[]> {
  const out: (ImageBitmap | undefined)[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await loadCover(items[i]);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, item: Item, x: number, y: number, w: number, h: number) {
  const hue = hashHue(item.fic?.fandoms[0] ?? item.title);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, `hsl(${hue} 16% 34%)`);
  g.addColorStop(1, `hsl(${hue + 25} 20% 24%)`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (w < 40) return;
  ctx.fillStyle = '#eef1f3';
  const size = Math.max(9, Math.round(w / 7));
  ctx.font = `600 ${size}px Georgia, 'Hiragino Mincho ProN', serif`;
  const lines = wrap(ctx, item.title, w - 12, Math.max(1, Math.floor((h * 0.6) / (size * 1.2))));
  lines.forEach((l, i) => ctx.fillText(l, x + 6, y + 8 + size + i * size * 1.2));
}

export async function renderYearImage(year: number, stats: Stats, items: Item[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bg = css('--bg');
  const surface = css('--surface');
  const text = css('--text');
  const text2 = css('--text-2');
  const accent = css('--accent');
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Hiragino Sans', sans-serif";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = text2;
  ctx.font = `600 26px ${sans}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('YEAR IN BOOKS', W / 2, 100);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = text;
  ctx.font = `600 64px Georgia, 'Iowan Old Style', serif`;
  ctx.fillText(String(year), W / 2, 175);

  const total = stats.finishedBooks + stats.finishedFics;
  ctx.font = `700 150px ${sans}`;
  ctx.fillText(String(total), W / 2, 335);
  ctx.fillStyle = text2;
  ctx.font = `400 32px ${sans}`;
  ctx.fillText(total === 1 ? 'book or fic finished' : 'books and fics finished', W / 2, 385);

  // Tiles.
  const tiles: [string, string][] = [
    ['Books', String(stats.finishedBooks)],
    ['Fics', String(stats.finishedFics)],
    ['Pages', compact(stats.pages)],
    ['Words', compact(stats.words)],
  ];
  const gap = 20;
  const tw = (W - PAD * 2 - gap * 3) / 4;
  tiles.forEach(([label, value], i) => {
    const x = PAD + i * (tw + gap);
    ctx.fillStyle = surface;
    roundRect(ctx, x, 425, tw, 115, 16);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = text2;
    ctx.font = `500 22px ${sans}`;
    ctx.fillText(label, x + 20, 462);
    ctx.fillStyle = text;
    ctx.font = `600 46px ${sans}`;
    ctx.fillText(value, x + 20, 518);
  });

  // Cover wall: as many columns as needed for everything to fit.
  const top = 580;
  const bottom = H - 90;
  const shown = items.slice(0, 120);
  let cols = 4;
  let cw = 0;
  const cgap = 12;
  for (cols = 4; cols <= 14; cols++) {
    cw = (W - PAD * 2 - (cols - 1) * cgap) / cols;
    if (Math.ceil(shown.length / cols) * (cw * 1.5 + cgap) <= bottom - top) break;
  }
  const ch = cw * 1.5;
  const bitmaps = await loadAll(shown);
  shown.forEach((item, i) => {
    // Centre a row that isn't full.
    const inRow = Math.min(cols, shown.length - Math.floor(i / cols) * cols);
    const offset = ((cols - inRow) * (cw + cgap)) / 2;
    const x = PAD + offset + (i % cols) * (cw + cgap);
    const y = top + Math.floor(i / cols) * (ch + cgap);
    ctx.save();
    roundRect(ctx, x, y, cw, ch, 6);
    ctx.clip();
    const bmp = bitmaps[i];
    if (bmp) {
      // Cover-fit crop.
      const scale = Math.max(cw / bmp.width, ch / bmp.height);
      const sw = cw / scale;
      const sh = ch / scale;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, cw, ch);
    } else drawPlaceholder(ctx, item, x, y, cw, ch);
    ctx.restore();
  });
  if (items.length > shown.length) {
    ctx.textAlign = 'center';
    ctx.fillStyle = text2;
    ctx.font = `500 24px ${sans}`;
    ctx.fillText(`+ ${items.length - shown.length} more`, W / 2, bottom + 10);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = `600 24px Georgia, serif`;
  ctx.fillText('Reading Log', W / 2, H - 36);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t create the image.'))), 'image/png'),
  );
}
