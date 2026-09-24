import type { Ao3Rating, BookFormat, Currency, PurchaseSource, Settings, Status } from './types';

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'want-to-read', label: 'Want to Read' },
  { value: 'currently-reading', label: 'Currently Reading' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'read', label: 'Read' },
  { value: 'dnf', label: 'DNF' },
];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label])) as Record<
  Status,
  string
>;

export const FORMATS: { value: BookFormat; label: string }[] = [
  { value: 'paperback', label: 'Paperback' },
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'ebook', label: 'Ebook' },
  { value: 'manga', label: 'Manga' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'other', label: 'Other' },
];

export const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.value, f.label])) as Record<
  BookFormat,
  string
>;

export const CURRENCIES: { value: Currency; label: string; symbol: string; decimals: number }[] = [
  { value: 'JPY', label: 'Japanese yen', symbol: '¥', decimals: 0 },
  { value: 'USD', label: 'US dollar', symbol: '$', decimals: 2 },
];

export const PURCHASE_SOURCES: { value: PurchaseSource; label: string }[] = [
  { value: 'bought', label: 'Bought' },
  { value: 'free', label: 'Free' },
  { value: 'library', label: 'Library' },
  { value: 'gift', label: 'Gift' },
  { value: 'subscription', label: 'Subscription' },
];

export const AO3_RATINGS: { value: Ao3Rating; label: string }[] = [
  { value: 'general', label: 'General Audiences' },
  { value: 'teen', label: 'Teen And Up Audiences' },
  { value: 'mature', label: 'Mature' },
  { value: 'explicit', label: 'Explicit' },
  { value: 'not-rated', label: 'Not Rated' },
];

export const AO3_WARNINGS = [
  'Creator Chose Not To Use Archive Warnings',
  'No Archive Warnings Apply',
  'Graphic Depictions Of Violence',
  'Major Character Death',
  'Rape/Non-Con',
  'Underage Sex',
];

export const AO3_CATEGORIES = ['F/F', 'F/M', 'Gen', 'M/M', 'Multi', 'Other'];

/** ISO 639-1 languages. The first three are pinned at the top of dropdowns. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'es', name: 'Spanish' },
  { code: 'et', name: 'Estonian' },
  { code: 'fa', name: 'Persian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'ga', name: 'Irish' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hr', name: 'Croatian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'hy', name: 'Armenian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'it', name: 'Italian' },
  { code: 'ka', name: 'Georgian' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'ko', name: 'Korean' },
  { code: 'la', name: 'Latin' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'ms', name: 'Malay' },
  { code: 'nl', name: 'Dutch' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tl', name: 'Filipino' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'be', name: 'Belarusian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh', name: 'Chinese' },
];

export const PINNED_LANGUAGES = 3;

export const LANGUAGE_NAME: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.name]),
);

export const AO3_LANGUAGE_CODES: Record<string, string> = {
  ...Object.fromEntries(LANGUAGES.map((l) => [l.name.toLowerCase(), l.code])),
  русский: 'ru',
  日本語: 'ja',
};

export function defaultSettings(now: string): Settings {
  return {
    id: 'settings',
    createdAt: now,
    updatedAt: now,
    theme: 'system',
    displayCurrency: 'USD',
    wordsPerPage: { en: 275, ru: 250, ja: 250 },
    jaCharsPerWord: 2.5,
    audiobookWordsPerHour: 9000,
    mangaCountsWords: false,
  };
}
