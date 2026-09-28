import { describe, expect, it } from 'vitest';
import { appleMusicSearchUrl, confidentMatch, isAppleMusicUrl, musicStore, parseItunesResults } from '../src/lib/appleMusic';

const raw = {
  resultCount: 3,
  results: [
    {
      wrapperType: 'track', kind: 'song', trackId: 1, trackName: 'Holocene', artistName: 'Bon Iver', collectionName: 'Bon Iver',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/holocene/1?i=1&uo=4',
    },
    { wrapperType: 'track', kind: 'music-video', trackId: 2, trackName: 'Holocene', trackViewUrl: 'https://music.apple.com/us/music-video/2' },
    {
      wrapperType: 'track', kind: 'song', trackId: 3, trackName: 'Clair de Lune (Remastered 2011)', artistName: 'Claude Debussy & Someone',
      trackViewUrl: 'https://music.apple.com/jp/album/x/9?i=3&uo=4',
    },
  ],
};

describe('Apple Music', () => {
  it('reads songs from the iTunes Search API', () => {
    const tracks = parseItunesResults(raw);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      id: 1, title: 'Holocene', artist: 'Bon Iver', album: 'Bon Iver',
      artwork: 'https://is1-ssl.mzstatic.com/image/thumb/x/120x120bb.jpg',
      url: 'https://music.apple.com/us/album/holocene/1?i=1',
    });
  });

  it('matches only the song typed in', () => {
    const tracks = parseItunesResults(raw);
    expect(confidentMatch(tracks, 'holocene')?.id).toBe(1);
    expect(confidentMatch(tracks, 'Holocene', 'bon iver')?.id).toBe(1);
    expect(confidentMatch(tracks, 'Holocene', 'Taylor Swift')).toBeUndefined();
    expect(confidentMatch(tracks, 'Clair de Lune', 'Debussy')?.id).toBe(3);
    expect(confidentMatch(tracks, 'Clair')).toBeUndefined();
  });

  it('picks the store and recognises links', () => {
    expect(musicStore({ musicStore: 'gb' }, ['ja-JP'])).toBe('gb');
    expect(musicStore({}, ['en-JP', 'en'])).toBe('jp');
    expect(musicStore({}, ['en'])).toBe('us');
    expect(isAppleMusicUrl('https://music.apple.com/us/album/x/1?i=2')).toBe(true);
    expect(isAppleMusicUrl('https://geo.music.apple.com/us/album/x/1')).toBe(true);
    expect(isAppleMusicUrl('https://youtu.be/x')).toBe(false);
    expect(isAppleMusicUrl('https://evilmusic.apple.com.example/')).toBe(false);
    expect(appleMusicSearchUrl('Holocene', 'Bon Iver', 'jp')).toBe('https://music.apple.com/jp/search?term=Holocene%20Bon%20Iver');
  });
});

describe('Apple Music links', () => {
  it('finds the song in shared links', async () => {
    const { appleMusicSongRef } = await import('../src/lib/appleMusic');
    expect(appleMusicSongRef('https://music.apple.com/jp/album/holocene/1440822781?i=1440822792')).toEqual({ id: '1440822792', store: 'jp' });
    expect(appleMusicSongRef('music.apple.com/us/song/holocene/1440822792')).toEqual({ id: '1440822792', store: 'us' });
    expect(appleMusicSongRef('https://music.apple.com/jp/song/1440822792')).toEqual({ id: '1440822792', store: 'jp' });
    expect(appleMusicSongRef('Holocene by Bon Iver https://music.apple.com/gb/album/x/1?i=42&ls')).toEqual({ id: '42', store: 'gb' });
    expect(appleMusicSongRef('https://music.apple.com/jp/album/bon-iver/1440822781')).toBeUndefined(); // an album
    expect(appleMusicSongRef('https://open.spotify.com/track/abc')).toBeUndefined();
  });

  it('looks up name, artist and artwork', async () => {
    const { lookupAppleSong } = await import('../src/lib/appleMusic');
    const { vi } = await import('vitest');
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ resultCount: 2, results: [
        { wrapperType: 'collection', collectionId: 1440822781, collectionName: 'Bon Iver' },
        { wrapperType: 'track', kind: 'song', trackId: 1440822792, trackName: 'Holocene', artistName: 'Bon Iver', collectionName: 'Bon Iver',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/jp/album/holocene/1440822781?i=1440822792&uo=4' },
      ] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const t = await lookupAppleSong('https://music.apple.com/jp/album/holocene/1440822781?i=1440822792', 'us');
    expect(t).toMatchObject({ title: 'Holocene', artist: 'Bon Iver', url: 'https://music.apple.com/jp/album/holocene/1440822781?i=1440822792' });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://itunes.apple.com/lookup?id=1440822792&country=jp');
    vi.unstubAllGlobals();
  });
});
