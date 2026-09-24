// Page data handed over by the bookmarklets in the URL: #/import?d=<base64url(JSON)>.
import type { ItemDraft } from '../drafts';
import { collectAo3, isAo3Document, parseAo3Document, parseAo3Html } from './ao3';
import {
  collectGoodreads,
  isGoodreadsDocument,
  parseGoodreadsDocument,
  parseGoodreadsPayload,
  type GoodreadsPayload,
} from './goodreads-page';

export function decodePayload(d: string): Record<string, unknown> {
  const b64 = d.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function draftFromPayload(p: Record<string, unknown>): ItemDraft {
  if (p.s === 'ao3' && typeof p.h === 'string') return parseAo3Html(p.h, String(p.u ?? ''));
  if (p.s === 'gr') return parseGoodreadsPayload(p as unknown as GoodreadsPayload);
  throw new Error('Unrecognised import data.');
}

/** A saved AO3 or Goodreads page (.html). */
export function draftFromHtmlFile(html: string): ItemDraft {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (isAo3Document(doc)) return parseAo3Document(doc);
  if (isGoodreadsDocument(doc)) return parseGoodreadsDocument(doc);
  throw new Error('This file isn’t a saved AO3 fic or Goodreads book page.');
}

/** Builds a bookmarklet URL that runs `collect` on the page and opens the app with the result. */
function bookmarklet(appUrl: string, collect: (doc: Document, href: string) => unknown): string {
  const code =
    `(function(){var r=(${collect.toString()})(document,location.href);` +
    `if(typeof r==='string'){alert(r);return}` +
    `var b=new TextEncoder().encode(JSON.stringify(r)),t='';for(var i=0;i<b.length;i++)t+=String.fromCharCode(b[i]);` +
    `var u=${JSON.stringify(appUrl + '#/import?d=')}+btoa(t).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');` +
    `var w=window.open(u,'_blank');if(!w)location.href=u})()`;
  return 'javascript:' + encodeURIComponent(code);
}

export function ao3Bookmarklet(appUrl: string): string {
  return bookmarklet(appUrl, collectAo3);
}

export function goodreadsBookmarklet(appUrl: string): string {
  return bookmarklet(appUrl, collectGoodreads);
}
