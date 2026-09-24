// Apple Music links for songs, found with Apple's public iTunes Search API
// (no account or key needed). A music.apple.com song link opens the Music app
// on iPhone and Android when it's installed, or Apple's web player otherwise.
import type { Settings } from './types';
import { normalize } from './util';

export interface AppleTrack {
  id: number;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  url: string;
}

/** Apple Music storefronts offered in Settings (search results and links differ by country). */
export const MUSIC_STORES: { value: string; label: string }[] = [
  { value: 'us', label: 'United States' },
  { value: 'jp', label: 'Japan' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'kr', label: 'South Korea' },
  { value: 'ru', label: 'Russia' },
];

/** The store from Settings, else the device's region when it's one we list, else the US. */
export function musicStore(settings: Pick<Settings, 'musicStore'>, languages: readonly string[] = navigator.languages ?? []): string {
  if (settings.musicStore) return settings.musicStore;
  for (const lang of languages) {
    const region = lang.split('-')[1]?.toLowerCase();
    if (region && MUSIC_STORES.some((s) => s.value === region)) return region;
  }
  return 'us';
}

export function isAppleMusicUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)music\.apple\.com$|^itunes\.apple\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Search page on Apple Music, for songs without a link. */
export function appleMusicSearchUrl(title: string, artist: string | undefined, store: string): string {
  return `https://music.apple.com/${store}/search?term=${encodeURIComponent([title, artist].filter(Boolean).join(' '))}`;
}

type Raw = Record<string, unknown>;

export function parseItunesResults(json: unknown): AppleTrack[] {
  const results = (json as { results?: Raw[] })?.results ?? [];
  const out: AppleTrack[] = [];
  for (const r of results) {
    if (r.kind !== 'song' || typeof r.trackViewUrl !== 'string' || typeof r.trackName !== 'string') continue;
    const url = new URL(r.trackViewUrl);
    url.searchParams.delete('uo'); // tracking parameter
    const art = typeof r.artworkUrl100 === 'string' ? r.artworkUrl100 : undefined;
    out.push({
      id: Number(r.trackId),
      title: r.trackName,
      artist: String(r.artistName ?? ''),
      album: typeof r.collectionName === 'string' ? r.collectionName : undefined,
      artwork: art?.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/120x120bb.$1'),
      url: url.href,
    });
  }
  return out;
}

export async function searchAppleMusic(title: string, artist: string | undefined, store: string, signal?: AbortSignal): Promise<AppleTrack[]> {
  const q = new URLSearchParams({
    term: [title, artist].filter(Boolean).join(' '),
    media: 'music',
    entity: 'song',
    limit: '8',
    country: store,
  });
  const res = await fetch(`https://itunes.apple.com/search?${q}`, { signal });
  if (!res.ok) throw new Error(`Apple Music search failed (${res.status}).`);
  return parseItunesResults(await res.json());
}

const simplify = (s: string) =>
  normalize(s)
    .replace(/\s*[([].*?[)\]]\s*/g, ' ') // "(Remastered 2011)", "[feat. …]"
    .replace(/\s+-\s+.*$/, '') // "Song - Live"
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The result that clearly is the song typed in (same title, and same artist when one was given). */
export function confidentMatch(tracks: AppleTrack[], title: string, artist?: string): AppleTrack | undefined {
  const t = simplify(title);
  const a = artist ? simplify(artist) : '';
  return tracks.find((r) => {
    if (simplify(r.title) !== t) return false;
    if (!a) return true;
    const ra = simplify(r.artist);
    return ra.includes(a) || a.includes(ra);
  });
}
