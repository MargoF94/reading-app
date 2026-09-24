# Reading Log

A personal reading tracker for books, manga, audiobooks and AO3 fanfics.
Runs entirely in the browser, hosted on GitHub Pages. Your library is stored
on your device and synced to a private GitHub repo (`reading-data`).

See [PLAN.md](PLAN.md) for the full plan and roadmap.

## Using it

1. Open the site: `https://<your-username>.github.io/reading-app/`
2. **Settings → Sync**: enter your GitHub username, `reading-data`, and a
   fine-grained token with *Contents: Read and write* on that repo only.
3. On a phone, use the browser's "Add to Home Screen" to install it as an app.
4. **Import** (Add → Import): bring in a Goodreads library export (CSV), an AO3 fic (EPUB or HTML download, or saved page), a saved
   Goodreads page, or install the one-click bookmarklets for AO3 and Goodreads.

## Development

```sh
npm install
npm run dev      # local dev server
npm run check    # type check
npm test         # unit tests
npm run build    # production build into dist/
```

Pushes to the default branch are built and deployed by
`.github/workflows/deploy.yml`.
