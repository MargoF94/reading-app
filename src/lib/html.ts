// Converts HTML from AO3 summaries, Goodreads and Google Books descriptions to
// the Markdown used in the app. Runs on inert parsed documents only.

export function htmlToMarkdown(html: string | Element): string {
  let root: Element;
  if (typeof html === 'string') {
    root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  } else root = html;
  // Convert the contents; the container itself (e.g. AO3's summary blockquote) is not quoted.
  return tidy(children(root));
}

function tidy(md: string): string {
  return md
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function children(el: Element): string {
  let out = '';
  el.childNodes.forEach((n) => (out += convertNode(n)));
  return out;
}

function wrap(mark: string, inner: string): string {
  const t = inner.trim();
  return t ? `${mark}${t}${mark}` : inner;
}

function convertNode(node: Node): string {
  if (node.nodeType === 3) return (node.textContent ?? '').replace(/\s+/g, ' ');
  if (node.nodeType !== 1) return '';
  return convert(node as Element);
}

function convert(el: Element): string {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'script':
    case 'style':
    case 'noscript':
      return '';
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    case 'p':
    case 'div':
    case 'section':
    case 'center':
      return `\n\n${children(el)}\n\n`;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n${wrap('**', children(el))}\n\n`;
    case 'em':
    case 'i':
    case 'cite':
      return wrap('*', children(el));
    case 'strong':
    case 'b':
      return wrap('**', children(el));
    case 'spoiler':
      return wrap('||', children(el));
    case 'a': {
      const text = children(el);
      const href = el.getAttribute('href') ?? '';
      return /^https?:\/\//.test(href) && text.trim() && text.trim() !== href ? `[${text.trim()}](${href})` : text;
    }
    case 'blockquote': {
      const inner = tidy(children(el));
      return inner ? `\n\n${inner.split('\n').map((l) => '> ' + l).join('\n')}\n\n` : '';
    }
    case 'ul':
    case 'ol': {
      let n = 0;
      const items = [...el.children]
        .filter((c) => c.tagName.toLowerCase() === 'li')
        .map((li) => `${tag === 'ol' ? `${++n}.` : '-'} ${tidy(children(li))}`);
      return `\n\n${items.join('\n')}\n\n`;
    }
    default:
      return children(el);
  }
}

/** Plain text (no Markdown), whitespace collapsed. */
export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
