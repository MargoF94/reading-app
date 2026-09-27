// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { lookupForms, lookupWord, parseFreeDictionary, parseWiktionary, sensesText } from '../src/lib/dictionary';
import { parseLibraryFile, toLibraryFile } from '../src/lib/merge';
import { emptyCollections } from '../src/lib/merge';

// Shapes follow dictionaryapi.dev and Wikimedia's /page/definition responses.
const freeDict = [
  {
    word: 'ephemeral',
    phonetic: '/ɪˈfɛm(ə)ɹəl/',
    phonetics: [
      { text: '/ɪˈfɛm(ə)ɹəl/', audio: '' },
      { text: '/ɪˈfɛm(ə)ɹəl/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/ephemeral-uk.mp3' },
      { text: '/əˈfɛm(ə)ɹəl/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/ephemeral-us.mp3' },
      { text: '/əˈfɛm(ə)ɹəl/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/ephemeral-us.mp3' },
    ],
    meanings: [
      { partOfSpeech: 'adjective', definitions: [{ definition: 'Lasting for a short period of time.', example: 'an ephemeral fad' }] },
      { partOfSpeech: 'noun', definitions: [{ definition: 'Something which lasts for a short period of time.' }] },
    ],
  },
];

const wikt = {
  ru: [
    {
      partOfSpeech: 'Noun',
      language: 'Russian',
      definitions: [
        { definition: '<a href="/wiki/book">book</a>', parsedExamples: [{ example: '<b>кни́га</b> на столе́', translation: 'the book is on the table' }] },
        { definition: '' },
        { definition: '(<i>figuratively</i>) <span>volume</span>' },
      ],
    },
  ],
  en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'not this one' }] }],
};

describe('dictionary', () => {
  it('reads English meanings and pronunciations', () => {
    const r = parseFreeDictionary(freeDict, 'ephemeral')!;
    expect(r.senses).toEqual([
      { pos: 'adjective', text: 'Lasting for a short period of time.', example: 'an ephemeral fad' },
      { pos: 'noun', text: 'Something which lasts for a short period of time.', example: undefined },
    ]);
    expect(r.pronunciations).toEqual([
      { ipa: '/ɪˈfɛm(ə)ɹəl/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/ephemeral-uk.mp3', accent: 'UK' },
      { ipa: '/əˈfɛm(ə)ɹəl/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/ephemeral-us.mp3', accent: 'US' },
    ]);
    expect(parseFreeDictionary({ title: 'No Definitions Found' }, 'x')).toBeNull();
  });

  it('reads Wiktionary meanings for the chosen language as plain text', () => {
    const r = parseWiktionary(wikt, 'ru', 'книга')!;
    expect(r.senses).toEqual([
      { pos: 'noun', text: 'book', example: 'кни́га на столе́ — the book is on the table' },
      { pos: 'noun', text: '(figuratively) volume', example: undefined },
    ]);
    expect(r.sourceUrl).toBe('https://en.wiktionary.org/wiki/%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0#Russian');
    expect(parseWiktionary(wikt, 'ja', 'x')).toBeNull();
    // Markup is reduced to text; scripts are dropped entirely.
    expect(parseWiktionary({ ru: [{ definitions: [{ definition: '<script>alert(1)</script>' }] }] }, 'ru', 'x')).toBeNull();
    expect(parseWiktionary({ ru: [{ definitions: [{ definition: '<img src=x onerror=alert(1)>cat' }] }] }, 'ru', 'x')?.senses[0].text).toBe('cat');
  });

  it('tries sensible spellings', () => {
    expect(lookupForms(' Кни́га ', 'ru')).toEqual(['Кни́га', 'кни́га', 'Книга', 'книга']);
    expect(lookupForms('Tokyo', 'en')).toEqual(['Tokyo', 'tokyo']);
    expect(sensesText([{ pos: 'noun', text: 'a' }, { text: 'b' }])).toBe('(noun) a\nb');
  });

  it('falls back to Wiktionary for English and reports unreachable dictionaries', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('dictionaryapi')) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ en: [{ partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'to <b>test</b>' }] }] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await lookupWord('Test', 'en'))?.senses[0]).toEqual({ pos: 'verb', text: 'to test', example: undefined });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await lookupWord('zzzz', 'ja')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(lookupWord('word', 'en')).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it('library files carry vocabulary and refuse newer schemas', () => {
    const c = emptyCollections();
    c.vocabulary.push({ id: 'w', createdAt: 'a', updatedAt: 'a', itemId: 'i', word: 'x', senses: [{ text: 'y' }] });
    const file = toLibraryFile(c, 'now');
    expect(file.schema).toBe(3);
    expect(parseLibraryFile(JSON.stringify(file)).vocabulary).toHaveLength(1);
    expect(parseLibraryFile(JSON.stringify({ app: 'reading-app', schema: 1, items: [] })).vocabulary).toEqual([]);
    expect(() => parseLibraryFile(JSON.stringify({ app: 'reading-app', schema: 4 }))).toThrow();
  });
});
