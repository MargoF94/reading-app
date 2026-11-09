// Covers for fics without a picture: a paperback with three bands. The fandom is on the
// top band, the title and author in the middle, the pairing on the bottom band. The colours
// are muted book-cloth shades picked by the fandom, so a fandom's fics look like a set.
import type { Item } from './types';

/** The top and bottom bands. */
export const BAND_COLORS = [
  '#563334', // oxblood
  '#7c5144', // rust
  '#83693d', // mustard
  '#4f5538', // olive
  '#2d433a', // forest
  '#2c5050', // teal
  '#2f414e', // petrol
  '#2b334a', // navy
  '#464164', // indigo
  '#4e3449', // plum
  '#7f535f', // dusty rose
  '#3d4348', // slate
  '#3a5071', // steel blue
  '#4e3e32', // umber
  '#52625a', // sage
  '#5e2d3e', // claret
];

export interface FicCoverColors {
  band: string;
  /** The lines where the bands meet. */
  rule: string;
  /** The middle band, behind the title. */
  paper: string;
  /** Writing on the bands. */
  onBand: string;
  /** The author's name. */
  by: string;
}

/** A number from text (FNV-1a), the same every time. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Colour `a` with `t` (0–1) of colour `b` mixed in (both #rrggbb). */
export function mix(a: string, b: string, t: number): string {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function ficCoverColors(item: Item): FicCoverColors {
  const band = BAND_COLORS[hash(item.fic?.fandoms[0] ?? item.title) % BAND_COLORS.length];
  return {
    band,
    rule: mix(band, '#000000', 0.35),
    paper: mix('#e7e1d4', band, 0.07),
    onBand: '#e6dbc8',
    by: mix(band, '#000000', 0.2),
  };
}

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

/** Type size for a title: smaller for long ones, bigger for very short ones (Japanese letters count double). */
export function titleScale(title: string): number {
  const n = [...title].reduce((sum, c) => sum + (WIDE.test(c) ? 2 : 1), 0);
  return n <= 8 ? 1.25 : n <= 22 ? 1 : n <= 42 ? 0.84 : 0.7;
}
