# Reading App — Plan

A personal, single-user reading tracker for books, manga, audiobooks and AO3 fanfics.
Hosted on GitHub Pages. Interface in English; content in English, Russian and Japanese.

Status: **phase 1 (foundation) built** — phases 2–4 to do.

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages (static files only, no server) |
| Data storage | Browser storage (IndexedDB) + sync to a **private** GitHub repo `reading-data` as JSON |
| Code maintenance | Owner will not edit code by hand → pick one stack and keep it simple |
| Stack | Vite + TypeScript + Svelte, Dexie (IndexedDB), Chart.js, Markdown + DOMPurify, vite-plugin-pwa, deployed by GitHub Actions |
| Routing | Hash routes (`#/library`) so page refreshes work on GitHub Pages |
| Fic sites | AO3 only |
| Japanese length | Characters converted to word-equivalents |
| Currencies | JPY and USD |
| Tags vs lists | Keep both |
| Extra status | "On hold" (for WIP fics waiting for updates, paused books) |
| Ratings | 1–5 stars in half-star steps |
| Formats | Books, manga, audiobooks (plus ebook/paperback/hardcover) |
| Reading goal | Separate yearly goals for books and for fics, plus a combined total |
| Goodreads | Import existing library from Goodreads CSV export |
| UI language | English only |
| App type | Installable PWA, works offline, fully responsive (mobile-first) |

## 2. Data storage

Two repositories:

- `reading-app` (this repo): the app's code only. Deployed to GitHub Pages. Contains no personal data.
- `reading-data` (private): the library.

```
reading-data/
  library.json      one document with "tables": items, readings, publishers, genres,
                    tags, series, authors, lists, goals, settings
  covers/<id>.webp  only covers uploaded by hand (resized in the browser to ~30 KB)
```

- JSON, not CSV, because records are nested (read-throughs, progress logs, tag lists, purchases).
- Pretty-printed with stable key order so every sync is a readable git commit (free history and undo).
- Connection: a fine-grained GitHub token limited to `reading-data` → Contents: read & write. Pasted once per device in Settings, stored only in that browser.
- Sync: on app open, a few seconds after changes, and via a manual "Sync" button. Conflicts between devices are merged per record by `updatedAt`; deletions kept as tombstones.
- The app works fully offline; changes sync when back online.
- Exports: full JSON backup; CSV (books, fics, read-throughs) for spreadsheets.
- Import: Goodreads CSV export (title, authors, ISBN, rating, publisher, binding, pages, year, date read, date added, shelves → tags, exclusive shelf → status, review, read count).
- Security: all Markdown and imported HTML is sanitised (the token lives in browser storage).

## 3. Data model

### Item (book or fic) — shared fields
- `type`: book | fic
- title, original title, title reading/romanisation
- authors (author records support names in several scripts, e.g. Мураками / 村上春樹 / Haruki Murakami)
- language (dropdown), original language
- genres (own curated list), tags
- series + number
- description / summary (expandable)
- cover (external URL, uploaded image, or generated placeholder for fics)
- status: want-to-read | currently-reading | on-hold | read | dnf
- rating (0.5–5), review (Markdown, whole-review spoiler flag + inline spoilers)
- word count + flag exact / estimated
- date added, updatedAt

### Book-only
- ISBN-10 / ISBN-13
- publisher (dropdown with "add new")
- publication date
- format: hardcover | paperback | ebook | manga (tankōbon) | audiobook | other
- page count; for audiobooks also duration (h:mm) and narrator
- Goodreads URL
- purchases (list): date, price, currency (JPY | USD), store, source (Bought | Free | Library | Gift | Subscription), converted price in display currency
- optional link to other entries as "editions of the same work" (e.g. JP original + EN translation)

### Fic-only (AO3) — confirmed from a sample saved AO3 page
Source in the page: `dl.work.meta`, `h2.title`, `h3.byline`, `.summary blockquote`, canonical link.
- URL, work ID (from `/works/<id>`), author (pseud)
- rating (General / Teen / Mature / Explicit / Not Rated)
- archive warnings, category (F/F, F/M, Gen, M/M, Multi, Other)
- fandoms, relationships, characters, additional tags
- AO3 series + part number (when present)
- published, updated, completed dates
- complete / WIP (chapters `3/?` → WIP)
- words, chapters available / chapters total
- snapshot of kudos, hits, bookmarks, comments (optional, with date)
- last refreshed date

### Read-through (supports re-reads)
- start date, finish date, outcome: reading | on-hold | finished | dnf
- progress unit: pages | percent | chapters (fics) | time (audiobooks)
- progress log: date, value, note
- optional per-read format (e.g. read in paperback, re-read as audiobook)

### Reference data
- Publishers — dropdown with add new, manageable in Settings
- Languages — fixed ISO list; English, Russian, Japanese pinned at the top
- Genres, Tags, Series (with optional total count), Authors, Fandoms (auto-collected from fics)

### Lists
- name, description, ordered items, per-item note (e.g. "Top 10 of 2025", "Buy in Japan")

### Goals
- per year: book target, fic target; combined total shown too

### Settings
- display currency for totals (JPY or USD)
- words-per-page per language, Japanese characters-per-word ratio, audiobook words-per-hour
- whether manga counts towards word stats
- theme (light / dark / system)
- optional Google Books API key
- sync token and repo name

## 4. Status flow

- Want to Read → Currently Reading: creates a read-through, start date = today
- Currently Reading → On hold → Currently Reading
- Currently Reading → Read (finish date = today) or DNF (keeps the page/chapter where you stopped)
- "Read again" starts a new read-through
- Read without dates is allowed (old reads, imports); such reads are excluded from time-based stats

## 5. Adding items

| Method | Details |
|---|---|
| ISBN | Typed or (later) scanned with the phone camera. Lookup chain: Open Library → Google Books → Japanese source (openBD / NDL Search, verify at build time). Russian coverage is weak → manual fallback. Google Books without a key shares a global daily quota → optional personal key in Settings. |
| Goodreads URL | The app cannot fetch Goodreads pages (no API since 2020, cross-site requests blocked). (a) **Bookmarklet** run on a Goodreads book page reads its embedded data and opens the app with a pre-filled form; (b) pasting a URL extracts the title from the link and searches by title; (c) Goodreads CSV import for the whole library. |
| AO3 saved page | Upload a saved AO3 page or AO3's Download → HTML file; parsed in the browser, fills every fic field. |
| AO3 bookmarklet | Same pre-fill, one click on an AO3 work page. |
| AO3 URL only | Stored with work ID; details cannot be fetched automatically. |
| Manual form | Always available for books, manga, audiobooks and fics. |

WIP fics: re-import the page (upload or bookmarklet) to update words/chapters; the app shows "N new chapters since you stopped".

## 6. Length and word counts

- Fics: AO3 word count (exact).
- Books: manual word count, or estimate = pages × words-per-page for the language (editable defaults).
- Japanese: characters ÷ characters-per-word ratio (editable default ≈ 2.5) → word-equivalents; estimated if only pages known.
- Audiobooks: print page count if known, otherwise duration × words-per-hour (default ≈ 9,000).
- Manga: counted in books and pages; excluded from word stats by default (setting).
- Every estimated value is marked as such in stats.

## 7. Money

- Price stored in original currency (JPY or USD).
- Converted to the display currency using the rate on the purchase date (auto-filled from a free exchange-rate source, editable).
- Dashboard shows totals per currency and combined.

## 8. Screens

- **Home**: currently reading (quick progress update: page / chapter / % / time + note), goal rings (books, fics), recently finished, WIPs with new chapters, on-hold items.
- **Library**: grid/list toggle; filters: type, format, status, language, genre, tag, fandom, publisher, rating, year read; sort; search across all scripts.
- **Item page**: cover, status button, half-star rating, progress bar + log, read-through history, review with spoiler cover, purchases, tags, lists, series prev/next, expandable description, AO3 tag groups for fics.
- **Add / Edit**: tabs ISBN | Goodreads | AO3 | Manual.
- **Browse**: author, series (reading order + gaps "4 of 7"), publisher, genre, tag, fandom, relationship.
- **Lists**: create, reorder by drag, per-item notes.
- **Dashboard** and **Year in Books**.
- **Settings**: sync, import/export, manage publishers/genres/tags, currency, length defaults, theme.

Responsive: bottom tab bar on phones (Home · Library · ＋ · Stats · More), sidebar on tablet/desktop, grid 2→6 columns, tables become cards on small screens, large touch targets.

## 9. Dashboard

- Period: this month, this year, last year, custom range, all time. Filters: books / fics / both, format, language.
- Finished, started, on hold, DNF counts
- Pages, word-equivalents (exact vs estimated), listening hours
- Rating average and distribution
- Genres; fandoms, relationships, AO3 ratings for fics
- Language split EN / RU / JA, formats
- Top authors, publishers
- Average length, days to finish
- Per-month charts: items, pages, words
- Spending per month, per currency, average price per book; free vs paid reads
- Want-to-read added vs finished
- Goal pace for books and fics ("3 ahead")
- Pages/words are assigned to dates from the progress log (a book read Dec–Jan splits across years); if no log, all at the finish date. DNF counts only what was read.

**Year in Books**: cover wall, totals, shortest/longest, top rated, money spent, top fandoms; downloadable as an image.

## 10. Not possible / changed

| Original feature | Result |
|---|---|
| Community-voted genres | Not possible. Own genre list; bookmarklet can suggest Goodreads genres. |
| Other users' shelves, friends, social features | Removed (single user). Tags open a filtered page of your items. |
| Sign-in / accounts | Removed. Public URL shows an empty app; data is on your devices and private repo. |
| List of all editions | Not possible (no catalogue). Replaced by linking your own entries as editions. |
| Full series page with complete reading order | Partial: only items you added, plus optional series total to show gaps. |
| Adding a book from only a Goodreads URL | Not possible directly; bookmarklet / title search / CSV import instead. |
| Adding a fic from only an AO3 URL, automatic new-chapter alerts | Not possible (no AO3 API, cross-site requests blocked). Saved page or bookmarklet instead. |
| Goodreads average rating | Only a one-time snapshot via bookmarklet. |
| ISBN lookup for Russian books | Partial; often manual. |

## 11. Build phases

1. **Foundation**: project setup, GitHub Pages deploy, storage + private-repo sync + JSON export/import, manual add for all types, statuses (incl. on hold), progress + read-throughs, half-star rating + review, library and item pages, publisher/language dropdowns, responsive layout, PWA.
2. **Importing**: ISBN lookup, AO3 page import, Goodreads CSV import, bookmarklets (Goodreads, AO3), covers, currency conversion.
3. **Organising & stats**: tags, lists, series/author/fandom pages, dashboard, goals, Year in Books.
4. **Extras**: barcode scanning, edition linking, WIP update tracking, shareable Year in Books image.
