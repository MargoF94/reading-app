// Word meanings for the vocabulary feature.
// - English: Free Dictionary API (dictionaryapi.dev, built from Wiktionary) — meanings,
//   IPA and recordings; falls back to Wiktionary.
// - Everything else (Russian, Japanese, …): English Wiktionary, the largest free
//   multilingual dictionary, which gives English meanings for words in any language.
// Both allow requests from web pages and need no key.
import type { WordPronunciation, WordSense } from './types';

export interface LookupResult {
  word: string; // headword as the dictionary spells it
  senses: WordSense[];
  pronunciations: WordPronunciation[];
  source: string;
  sourceUrl: string;
}

const MAX_SENSES = 16;

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Dictionary HTML → plain text (never rendered as HTML). */
export function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ---- Free Dictionary API (English) -------------------------------------------

export function parseFreeDictionary(json: unknown, word: string): LookupResult | null {
  if (!Array.isArray(json) || !json.length) return null;
  const senses: WordSense[] = [];
  const pronunciations: WordPronunciation[] = [];
  const seen = new Set<string>();
  for (const entry of json as Obj[]) {
    for (const p of (entry.phonetics as Obj[] | undefined) ?? []) {
      const ipa = str(p.text);
      const audio = str(p.audio);
      if (!ipa && !audio) continue;
      const accent = audio?.match(/-(us|uk|au|ca)\.mp3$/i)?.[1].toUpperCase();
      const key = `${ipa}|${accent ?? ''}|${audio ? 1 : 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pronunciations.push({ ipa, audio: audio && /^https:\/\//.test(audio) ? audio : undefined, accent });
    }
    if (!pronunciations.length && str(entry.phonetic)) pronunciations.push({ ipa: str(entry.phonetic) });
    for (const m of (entry.meanings as Obj[] | undefined) ?? []) {
      for (const d of (m.definitions as Obj[] | undefined) ?? []) {
        const text = str(d.definition);
        if (text) senses.push({ pos: str(m.partOfSpeech), text, example: str(d.example) });
      }
    }
  }
  if (!senses.length) return null;
  // Recordings first, then IPA-only entries; one of each accent is enough.
  pronunciations.sort((a, b) => Number(!!b.audio) - Number(!!a.audio));
  const shown: WordPronunciation[] = [];
  for (const p of pronunciations) {
    // Skip repeats: same accent and IPA, or an IPA-only line already shown with a recording.
    if (shown.some((s) => s.ipa === p.ipa && (s.accent === p.accent || !p.audio))) continue;
    shown.push(p);
  }
  const head = str((json[0] as Obj).word) ?? word;
  return {
    word: head,
    senses: senses.slice(0, MAX_SENSES),
    pronunciations: shown.slice(0, 3),
    source: 'Free Dictionary (Wiktionary)',
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(head)}#English`,
  };
}

async function freeDictionary(word: string, signal?: AbortSignal): Promise<LookupResult | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dictionary error ${res.status}`);
  return parseFreeDictionary(await res.json(), word);
}

// ---- Wiktionary (any language) ---------------------------------------------

export function parseWiktionary(json: unknown, lang: string, word: string): LookupResult | null {
  const sections = (json as Record<string, Obj[]> | null)?.[lang];
  if (!Array.isArray(sections)) return null;
  const senses: WordSense[] = [];
  let language = '';
  for (const s of sections) {
    language ||= str(s.language) ?? '';
    for (const d of (s.definitions as Obj[] | undefined) ?? []) {
      const html = str(d.definition);
      const text = html ? htmlText(html) : '';
      if (!text) continue;
      const ex = ((d.parsedExamples as Obj[] | undefined) ?? [])[0];
      const example = ex ? [str(ex.example), str(ex.translation)].filter(Boolean).map((e) => htmlText(e!)).join(' — ') : undefined;
      senses.push({ pos: str(s.partOfSpeech)?.toLowerCase(), text, example: example || undefined });
    }
  }
  if (!senses.length) return null;
  return {
    word,
    senses: senses.slice(0, MAX_SENSES),
    pronunciations: [],
    source: 'Wiktionary',
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}${language ? '#' + encodeURIComponent(language.replace(/ /g, '_')) : ''}`,
  };
}

async function wiktionary(word: string, lang: string, signal?: AbortSignal): Promise<LookupResult | null> {
  const res = await fetch(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, '_'))}?redirect=true`,
    { signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wiktionary error ${res.status}`);
  return parseWiktionary(await res.json(), lang, word);
}

// ---- lookup -------------------------------------------------------------------

/** Spellings to try: as typed, lower-case, and (Russian) without stress marks. */
export function lookupForms(word: string, lang: string): string[] {
  const w = word.trim().normalize('NFC');
  const forms = [w, w.toLowerCase()];
  if (lang === 'ru') forms.push(...forms.map((f) => f.normalize('NFD').replace(/́/g, '').normalize('NFC')));
  return [...new Set(forms)].filter(Boolean);
}

/**
 * Looks a word up in the best dictionary for its language.
 * Returns null when no dictionary has it; throws when the dictionaries can't be reached.
 */
export async function lookupWord(word: string, lang: string, signal?: AbortSignal): Promise<LookupResult | null> {
  let reached = false;
  let lastError: unknown;
  for (const form of lookupForms(word, lang)) {
    if (lang === 'en') {
      try {
        const hit = await freeDictionary(form, signal);
        reached = true;
        if (hit) return hit;
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
      }
    }
    try {
      const hit = await wiktionary(form, lang, signal);
      reached = true;
      if (hit) return hit;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  if (!reached) throw lastError instanceof Error ? lastError : new Error('Couldn’t reach the dictionary.');
  return null;
}

/** Joins chosen senses for display and editing as one block of text. */
export function sensesText(senses: WordSense[]): string {
  return senses.map((s) => (s.pos ? `(${s.pos}) ${s.text}` : s.text)).join('\n');
}

const SPEECH_LANG: Record<string, string> = { en: 'en-US', ru: 'ru-RU', ja: 'ja-JP' };

/** Plays a recording, or reads the word aloud with the device's voice. Returns false if neither works. */
export function pronounce(word: string, lang: string | undefined, audio?: string): boolean {
  if (audio) {
    void new Audio(audio).play().catch(() => speak(word, lang));
    return true;
  }
  return speak(word, lang);
}

function speak(word: string, lang: string | undefined): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = SPEECH_LANG[lang ?? ''] ?? lang ?? 'en-US';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}
