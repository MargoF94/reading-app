// Covers for books, manga and fics without a picture: a faded gothic window in fog, a
// couple of cracks, and the title in worn white capitals. Black, greys and off-white only.
// Each item gets its own window, cracks and stretch of fog, always the same ones.
import type { Item } from './types';

/** A number from text (FNV-1a), the same every time. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Random numbers in 0..1 that are the same for the same seed (mulberry32). */
export function random(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seedOf = (item: Item): number => hash(item.fic?.workId ?? item.id ?? item.title);

/** Which of `n` versions of something an item gets. */
export const variant = (seed: number, n: number): number => (seed >>> 7) % n;

// ---- the writing ----

/** "Rise of the Guardians (2012)" → "Rise of the Guardians"; "呪術廻戦 | Jujutsu Kaisen" → "Jujutsu Kaisen". */
export function shortFandom(fandom: string): string {
  const s = (fandom.split(' | ').pop() ?? fandom)
    .replace(/\s+-\s+[^-]+$/, '') // "Harry Potter - J. K. Rowling"
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  return s || fandom;
}

/** The name a character goes by: "Jack Frost" → "Jack", "E. Aster Bunnymund" → "Aster". */
export function shortName(name: string): string {
  const words = name.split(/\s+/);
  return words.find((w) => [...w].length > 2 && !w.endsWith('.')) ?? words[0];
}

/** The fic's first pairing, short: "Jack Frost/Pitch Black" → "Jack / Pitch"; friends get "&". */
export function shipLabel(item: Item): string | undefined {
  const rel = item.fic?.relationships[0];
  if (!rel) return undefined;
  const romantic = rel.includes('/');
  const names = rel
    .split(romantic ? '/' : /\s+&\s+/)
    .map((n) => shortName(n.split(' | ')[0].replace(/\s*\([^)]*\)/g, '').trim()))
    .filter(Boolean);
  return names.length ? names.join(romantic ? ' / ' : ' & ') : undefined;
}

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Japanese, Chinese or Korean in the text. */
export const isCjk = (text: string): boolean => WIDE.test(text);

/** Type size for a title: smaller for long ones, bigger for very short ones (Japanese letters count double). */
export function titleScale(title: string): number {
  const n = [...title].reduce((sum, c) => sum + (WIDE.test(c) ? 2 : 1), 0);
  return n <= 8 ? 1.25 : n <= 22 ? 1 : n <= 42 ? 0.84 : 0.7;
}

export interface CoverText {
  /** In a small box at the top: the fandom, or the series. */
  label?: string;
  /** Under the title: the pairing, or the book's number in its series. */
  subtitle?: string;
  /** A small line above the author. */
  tagline?: string;
}

export function coverText(item: Item, series?: string): CoverText {
  if (item.type === 'fic') {
    const fandom = item.fic?.fandoms[0];
    return {
      label: fandom ? shortFandom(fandom) : 'Archive of Our Own',
      subtitle: shipLabel(item),
      tagline: fandom ? 'Archive of Our Own' : undefined,
    };
  }
  const n = item.seriesNumber?.trim();
  // "Lantern Street, Vol. 2" already says which volume it is.
  const numbered = !!n && new RegExp(`(^|\\D)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\D|$)`).test(item.title);
  return {
    label: series || undefined,
    subtitle: series && n && !numbered ? `${item.type === 'manga' ? 'Volume' : 'Book'} ${n}` : undefined,
  };
}

// ---- the picture (in a 200 × 300 box) ----

/** A pointed (equilateral) arch from x1 to x2, springing at y, down to `base`. */
export function arch(x1: number, x2: number, y: number, base: number): string {
  const span = x2 - x1;
  const apex = y - span * 0.866;
  const xm = (x1 + x2) / 2;
  return `M${x1} ${base} L${x1} ${y} A${span} ${span} 0 0 1 ${xm} ${apex} A${span} ${span} 0 0 1 ${x2} ${y} L${x2} ${base}`;
}

/** Jagged cracks running in from the edges, sometimes forking (as polyline points). */
export function cracks(seed: number, count = 2): string[] {
  const r = random(seed);
  const out: string[] = [];
  const walk = (x: number, y: number, angle: number, steps: number, depth: number) => {
    const pts = [`${x.toFixed(1)},${y.toFixed(1)}`];
    for (let i = 0; i < steps; i++) {
      angle += (r() - 0.5) * 1.1;
      const len = 5 + r() * 9;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      if (depth < 2 && r() < 0.16) walk(x, y, angle + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), Math.floor(steps / 2), depth + 1);
      if (x < -10 || x > 210 || y < -10 || y > 310) break;
    }
    out.push(pts.join(' '));
  };
  for (let i = 0; i < count; i++) {
    const side = Math.floor(r() * 4);
    const [x, y, a] =
      side === 0 ? [r() * 200, -2, Math.PI / 2] : side === 1 ? [202, r() * 300, Math.PI] : side === 2 ? [r() * 200, 302, -Math.PI / 2] : [-2, r() * 300, 0];
    walk(x, y, a + (r() - 0.5) * 0.9, 16, 0);
  }
  return out;
}

/** The window's stonework: one of three kinds, as SVG path data with a line width. */
export function windowTracery(kind: number): { d: string; w: number }[] {
  const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;
  const out = [
    { d: arch(22, 178, 150, 300), w: 1.3 },
    { d: arch(30, 170, 150, 300), w: 0.6 },
  ];
  if (kind === 0) {
    // two lancets under a rose
    out.push({ d: arch(42, 96, 175, 300) + arch(104, 158, 175, 300) + ring(100, 92, 27), w: 1.3 });
    out.push({ d: ring(100, 92, 21), w: 0.6 });
    out.push({ d: [0, 1, 2, 3].map((k) => ring(100 + Math.cos((k * Math.PI) / 2) * 9, 92 + Math.sin((k * Math.PI) / 2) * 9, 8)).join(''), w: 0.7 });
    out.push({ d: 'M100 119 V300 M69 175 H131', w: 0.8 });
  } else if (kind === 1) {
    // three lancets, the middle one tallest
    out.push({ d: arch(40, 78, 190, 300) + arch(81, 119, 160, 300) + arch(122, 160, 190, 300), w: 1.3 });
    out.push({ d: ring(59, 138, 9) + ring(141, 138, 9), w: 0.7 });
    out.push({ d: ring(100, 98, 11), w: 0.8 });
    out.push({ d: 'M40 230 H160 M40 262 H160', w: 0.5 });
  } else {
    // one great rose
    out.push({ d: ring(100, 112, 52), w: 1.3 });
    out.push({ d: ring(100, 112, 44), w: 0.6 });
    out.push({ d: ring(100, 112, 14), w: 0.8 });
    const spokes = Array.from({ length: 16 }, (_, k) => {
      const a = (k * Math.PI) / 8;
      return `M${(100 + Math.cos(a) * 14).toFixed(1)} ${(112 + Math.sin(a) * 14).toFixed(1)} L${(100 + Math.cos(a) * 44).toFixed(1)} ${(112 + Math.sin(a) * 44).toFixed(1)}`;
    });
    out.push({ d: spokes.join(' '), w: 0.6 });
    out.push({
      d: Array.from({ length: 8 }, (_, k) => {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        return ring(100 + Math.cos(a) * 33, 112 + Math.sin(a) * 33, 6);
      }).join(''),
      w: 0.5,
    });
    out.push({ d: 'M70 175 V300 M100 175 V300 M130 175 V300', w: 0.6 });
  }
  return out;
}
