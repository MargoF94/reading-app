// foliate-js ships without type declarations; only the parts the reader uses are typed.
declare module 'foliate-js/view.js' {
  export interface TocItem {
    label?: string;
    href?: string;
    subitems?: TocItem[];
  }
  export interface Book {
    dir?: string;
    toc?: TocItem[];
    metadata?: { title?: unknown; language?: string | string[] };
    sections: { linear?: string }[];
    resolveHref(href: string): { index: number } | undefined;
  }
  export interface RelocateDetail {
    fraction: number;
    cfi: string;
    range?: Range;
    tocItem?: { label?: string; href?: string };
  }
  export interface SearchResult {
    label?: string;
    subitems?: { cfi: string; excerpt: { pre: string; match: string; post: string } }[];
    progress?: number;
  }
  export interface Renderer extends HTMLElement {
    page: number;
    pages: number;
    setStyles(css: string): void;
  }
  export class View extends HTMLElement {
    book: Book;
    renderer: Renderer;
    lastLocation?: RelocateDetail;
    open(file: Blob): Promise<void>;
    close(): void;
    init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    getSectionFractions(): number[];
    search(opts: { query: string }): AsyncGenerator<SearchResult | 'done'>;
    clearSearch(): void;
    deselect(): void;
    addAnnotation(a: { value: string }): Promise<unknown>;
    deleteAnnotation(a: { value: string }): Promise<unknown>;
    getCFI(index: number, range?: Range): string;
  }
}

declare module 'foliate-js/epubcfi.js' {
  export function collapse(cfi: string, toEnd?: boolean): string;
  export function compare(a: string, b: string): number;
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static underline(rects: unknown, options?: { color?: string; width?: number; writingMode?: string }): SVGElement;
  }
}
