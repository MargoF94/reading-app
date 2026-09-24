import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders a review. Supports Markdown plus inline spoilers written as
 * ||hidden text||. Output is sanitised.
 */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  const withSpoilers = html.replace(
    /\|\|([\s\S]+?)\|\|/g,
    '<span class="spoiler" tabindex="0" role="button" aria-label="Spoiler, activate to reveal">$1</span>',
  );
  return DOMPurify.sanitize(withSpoilers, { ADD_ATTR: ['tabindex', 'role', 'aria-label'] });
}
