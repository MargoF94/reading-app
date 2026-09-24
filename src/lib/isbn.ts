// ISBN helpers. Everything is stored without hyphens; ISBN-13 is preferred.

export function cleanIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function validIsbn13(v: string): boolean {
  if (!/^97[89]\d{10}$/.test(v)) return false;
  const sum = [...v].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

export function validIsbn10(v: string): boolean {
  if (!/^\d{9}[\dX]$/.test(v)) return false;
  const sum = [...v].reduce((s, d, i) => s + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
  return sum % 11 === 0;
}

export function isbn10to13(v: string): string {
  const core = '978' + v.slice(0, 9);
  const sum = [...core].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return core + ((10 - (sum % 10)) % 10);
}

export function isbn13to10(v: string): string | undefined {
  if (!v.startsWith('978')) return undefined;
  const core = v.slice(3, 12);
  const sum = [...core].reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

/** Accepts either form (with or without hyphens); returns both, or null if invalid. */
export function parseIsbn(value: string): { isbn13: string; isbn10?: string } | null {
  const v = cleanIsbn(value);
  if (validIsbn13(v)) return { isbn13: v, isbn10: isbn13to10(v) };
  if (validIsbn10(v)) return { isbn13: isbn10to13(v), isbn10: v };
  return null;
}
