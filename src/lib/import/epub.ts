// AO3 "Download → EPUB" files. AO3 puts the same preface (tags, stats, summary)
// as its HTML download into one of the book's pages, so the AO3 parser can read it.
// If that page is missing, the EPUB's own metadata (content.opf) is used instead.
import { unzipSync, strFromU8 } from 'fflate';
import type { ItemDraft } from '../drafts';
import { htmlToMarkdown, textOf } from '../html';
import { LANGUAGES } from '../constants';
import { parseAo3Document } from './ao3';

export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
}

export function draftFromEpub(bytes: Uint8Array): ItemDraft {
  let files: Record<string, Uint8Array>;
  try {
    // Only text files are needed; skip images and fonts.
    files = unzipSync(bytes, { filter: (f) => /\.(x?html?|opf|xml)$/i.test(f.name) });
  } catch {
    throw new Error('This EPUB file couldn’t be opened. Try downloading it from AO3 again.');
  }
  const pages = Object.keys(files)
    .filter((n) => /\.x?html?$/i.test(n))
    .sort();

  // 1. The AO3 preface page.
  for (const name of pages) {
    const text = strFromU8(files[name]);
    if (!/class="tags"|class="work meta/.test(text)) continue;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    try {
      return parseAo3Document(doc);
    } catch {
      /* not the right page; keep looking */
    }
  }

  // 2. Fallback: package metadata.
  const opfName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.opf'));
  if (!opfName) throw new Error('This EPUB doesn’t look like an AO3 download.');
  const opf = new DOMParser().parseFromString(strFromU8(files[opfName]), 'application/xml');
  const dc = (tag: string) => [...opf.getElementsByTagNameNS('*', tag)].map((e) => textOf(e)).filter(Boolean);
  const title = dc('title')[0];
  if (!title) throw new Error('This EPUB has no title information.');
  const lang = dc('language')[0]?.slice(0, 2).toLowerCase();
  const url = [...dc('identifier'), ...dc('source')].find((v) => /archiveofourown\.org\/works\/\d+/.test(v));
  const workId = url?.match(/works\/(\d+)/)?.[1];
  const description = dc('description')[0];
  return {
    type: 'fic',
    source: 'AO3 EPUB',
    title,
    authors: dc('creator'),
    language: LANGUAGES.some((l) => l.code === lang) ? lang : undefined,
    description: description ? htmlToMarkdown(description) : undefined,
    fic: {
      site: 'ao3',
      workId,
      url: workId ? `https://archiveofourown.org/works/${workId}` : undefined,
      additionalTags: dc('subject'),
      warnings: [],
      categories: [],
      fandoms: [],
      relationships: [],
      characters: [],
      complete: false,
    },
  };
}
