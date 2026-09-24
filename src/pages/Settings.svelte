<script lang="ts">
  import { MUSIC_STORES, musicStore } from '../lib/appleMusic';
  import CoverFinder from '../components/CoverFinder.svelte';
  import ManageNames from '../components/ManageNames.svelte';
  import { needsRates, withRates } from '../lib/fx';
  import { CURRENCIES } from '../lib/constants';
  import { checkRepo } from '../lib/github';
  import { parseLibraryFile, stableStringify, toLibraryFile } from '../lib/merge';
  import { library } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Currency, Theme } from '../lib/types';
  import { nowIso, plural, today } from '../lib/util';

  // Guess the GitHub user from the Pages address (<user>.github.io).
  const guessedOwner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '';

  let owner = $state(sync.config?.owner ?? guessedOwner);
  let repo = $state(sync.config?.repo ?? 'reading-data');
  let token = $state('');
  let connecting = $state(false);
  let connectError = $state('');

  async function connect(e: Event) {
    e.preventDefault();
    connectError = '';
    const cfg = { owner: owner.trim(), repo: repo.trim(), token: token.trim() };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      connectError = 'Fill in all three fields.';
      return;
    }
    connecting = true;
    try {
      const info = await checkRepo(cfg);
      if (
        !info.private &&
        !confirm(
          `${info.fullName} is PUBLIC. Anyone could read your library, reviews and prices. Connect anyway? (Recommended: make the repo private first.)`,
        )
      ) {
        return;
      }
      await sync.configure(cfg);
      token = '';
      if (sync.state === 'error') connectError = sync.error ?? '';
      else toasts.show('Sync connected.');
    } catch (err) {
      connectError = err instanceof Error ? err.message : String(err);
    } finally {
      connecting = false;
    }
  }

  async function disconnect() {
    if (!confirm('Stop syncing on this device? Your library stays here and in the data repo.')) return;
    await sync.configure(null);
  }

  function exportJson() {
    const text = stableStringify(toLibraryFile(library.data, nowIso()));
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reading-log-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let fileInput: HTMLInputElement | undefined = $state();

  async function importJson(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = parseLibraryFile(await file.text());
      const n = await library.applyRemote(data);
      toasts.show(n ? `Imported ${plural(n, 'change')}.` : 'Nothing new in that file.');
      if (n) void sync.run();
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : 'Could not read that file.', 'error');
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  const lastSynced = $derived(sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'never');

  let googleKey = $state(library.settings.googleBooksKey ?? '');

  // Exchange rates for purchases saved offline or before rates existed.
  const missingRates = $derived(library.items.filter((i) => i.book?.purchases.some(needsRates)));
  let fillingRates = $state(false);

  async function fillRates() {
    fillingRates = true;
    try {
      const updated = [];
      for (const item of missingRates) {
        const purchases = await withRates(item.book!.purchases);
        if (purchases.some((p, i) => p !== item.book!.purchases[i])) updated.push({ ...item, book: { ...item.book!, purchases } });
      }
      await library.put('items', updated);
      const left = library.items.filter((i) => i.book?.purchases.some(needsRates)).length;
      toasts.show(left ? `Couldn’t get rates for ${plural(left, 'book')}. Try again later.` : 'Exchange rates filled in.');
    } finally {
      fillingRates = false;
    }
  }
</script>

<h1>Settings</h1>

<div class="stack">
  <section class="card stack">
    <h2>Sync</h2>
    {#if sync.config}
      <p style="margin:0">
        Connected to <strong>{sync.config.owner}/{sync.config.repo}</strong>.<br />
        <span class="small muted">Last synced: {lastSynced}</span>
      </p>
      {#if sync.error}<p class="error" role="alert">{sync.error}</p>{/if}
      <div class="row">
        <button type="button" class="btn primary" disabled={sync.state === 'syncing'} onclick={() => sync.run()}>
          {sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" class="btn" onclick={disconnect}>Disconnect</button>
      </div>
      <details>
        <summary class="small">Replace the token</summary>
        <form class="stack" style="margin-top:0.75rem" onsubmit={connect}>
          <label class="field"><span>New token</span><input type="password" bind:value={token} autocomplete="off" /></label>
          {#if connectError}<p class="error" role="alert">{connectError}</p>{/if}
          <div><button class="btn" disabled={connecting}>Save token</button></div>
        </form>
      </details>
    {:else}
      <p style="margin:0" class="small">
        Save your library to your private <code>reading-data</code> repo so all your devices share it. Without sync,
        the library lives only in this browser.
      </p>
      <form class="stack" onsubmit={connect}>
        <div class="grid-2">
          <label class="field"><span>GitHub username</span><input bind:value={owner} autocapitalize="off" /></label>
          <label class="field"><span>Data repo</span><input bind:value={repo} autocapitalize="off" /></label>
        </div>
        <label class="field">
          <span>Access token</span>
          <input type="password" bind:value={token} autocomplete="off" placeholder="github_pat_…" />
        </label>
        {#if connectError}<p class="error" role="alert">{connectError}</p>{/if}
        <div><button class="btn primary" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect'}</button></div>
      </form>
      <details>
        <summary class="small">How to create the token</summary>
        <ol class="small help">
          <li>On GitHub: profile picture → <strong>Settings</strong> → <strong>Developer settings</strong> → <strong>Personal access tokens</strong> → <strong>Fine-grained tokens</strong> → <strong>Generate new token</strong>.</li>
          <li>Repository access: <strong>Only select repositories</strong> → <code>reading-data</code>.</li>
          <li>Permissions → Repository permissions → <strong>Contents: Read and write</strong>.</li>
          <li>Generate, copy, and paste it above. The token is stored only on this device.</li>
        </ol>
      </details>
    {/if}
  </section>

  <section class="card stack">
    <h2>Preferences</h2>
    <div class="grid-2">
      <label class="field">
        <span>Theme</span>
        <select value={library.settings.theme} onchange={(e) => library.saveSettings({ theme: e.currentTarget.value as Theme })}>
          <option value="system">Match device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label class="field">
        <span>Default currency</span>
        <select
          value={library.settings.displayCurrency}
          onchange={(e) => library.saveSettings({ displayCurrency: e.currentTarget.value as Currency })}
        >
          {#each CURRENCIES as c (c.value)}<option value={c.value}>{c.symbol} {c.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Apple Music region</span>
        <select
          value={musicStore(library.settings)}
          onchange={(e) => library.saveSettings({ musicStore: e.currentTarget.value })}
        >
          {#each MUSIC_STORES as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
        </select>
        <span class="small muted">Where songs are looked up and opened. Use the country of your Apple account.</span>
      </label>
    </div>
  </section>

  <section class="card stack">
    <h2>Length estimates</h2>
    <p class="small muted" style="margin:0">
      Word totals in Stats use real word counts where known (AO3 fics, or a count you enter). Otherwise they are
      estimated from pages, or from listening time for audiobooks.
    </p>
    <div class="grid-3">
      {#each [['en', 'English'], ['ru', 'Russian'], ['ja', 'Japanese']] as [code, label] (code)}
        <label class="field">
          <span>Words per page · {label}</span>
          <input
            inputmode="numeric"
            value={library.settings.wordsPerPage[code] ?? ''}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              if (n > 0) library.saveSettings({ wordsPerPage: { ...library.settings.wordsPerPage, [code]: n } });
            }}
          />
        </label>
      {/each}
    </div>
    <div class="grid-2">
      <label class="field">
        <span>Japanese characters per word</span>
        <input
          inputmode="decimal"
          value={library.settings.jaCharsPerWord}
          onchange={(e) => {
            const n = Number(e.currentTarget.value);
            if (n > 0) library.saveSettings({ jaCharsPerWord: n });
          }}
        />
      </label>
      <label class="field">
        <span>Audiobook words per hour</span>
        <input
          inputmode="numeric"
          value={library.settings.audiobookWordsPerHour}
          onchange={(e) => {
            const n = Number(e.currentTarget.value);
            if (n > 0) library.saveSettings({ audiobookWordsPerHour: n });
          }}
        />
      </label>
    </div>
    <p class="small muted" style="margin:0">
      Japanese word counts (from AO3, or typed in) are character counts; they are divided by the number above to compare
      with English and Russian. Other languages use the English words-per-page value.
    </p>
    <label class="field" style="max-width:20rem">
      <span>Pages in an “average book” (for fics in books)</span>
      <input
        inputmode="numeric"
        value={library.settings.bookEquivalentPages ?? 400}
        onchange={(e) => {
          const n = Number(e.currentTarget.value);
          if (n > 0) library.saveSettings({ bookEquivalentPages: Math.round(n) });
        }}
      />
    </label>
    <label class="check">
      <input
        type="checkbox"
        checked={library.settings.mangaCountsWords}
        onchange={(e) => library.saveSettings({ mangaCountsWords: e.currentTarget.checked })}
      />
      Count manga in word totals (pages always count)
    </label>
  </section>

  <section class="card stack">
    <h2>Book lookups</h2>
    <p class="small muted" style="margin:0">
      Searching by ISBN or title uses Open Library and Google Books. Google’s free shared limit sometimes runs out; a
      free personal key avoids that (Google Cloud Console → enable “Books API” → Credentials → API key, restricted to
      this site’s address).
    </p>
    <label class="field">
      <span>Google Books API key (optional)</span>
      <input
        bind:value={googleKey}
        autocomplete="off"
        placeholder="AIza…"
        onchange={() => library.saveSettings({ googleBooksKey: googleKey.trim() || undefined })}
      />
    </label>
  </section>

  <section class="card stack">
    <h2>Covers</h2>
    <CoverFinder />
  </section>

  {#if missingRates.length}
    <section class="card stack">
      <h2>Exchange rates</h2>
      <p class="small muted" style="margin:0">
        {plural(missingRates.length, 'book has', 'books have')} prices without an exchange rate (saved while offline).
      </p>
      <div>
        <button type="button" class="btn" disabled={fillingRates} onclick={fillRates}>
          {fillingRates ? 'Looking up…' : 'Look up missing rates'}
        </button>
      </div>
    </section>
  {/if}

  <section class="card">
    <h2>Lists used in the book form</h2>
    <ManageNames collection="publishers" title="Publishers" />
    <ManageNames collection="authors" title="Authors" />
    <ManageNames collection="series" title="Series" />
    <ManageNames collection="genres" title="Genres" />
    <ManageNames collection="tags" title="Tags" />
  </section>

  <section class="card stack">
    <h2>Backup &amp; import</h2>
    <p class="small muted" style="margin:0">
      {plural(library.items.length, 'item')} in your library. A backup file can be imported on any device; it is
      merged with what's already there.
    </p>
    <div class="row">
      <button type="button" class="btn" onclick={exportJson}>Download backup (JSON)</button>
      <button type="button" class="btn" onclick={() => fileInput?.click()}>Import backup…</button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importJson} />
    </div>
    <p class="small" style="margin:0">
      To bring in your Goodreads library or add fics and books from AO3 and Goodreads pages, see
      <a href="#/import">Import</a>. Uploaded cover photos live in the data repo, not in the backup file.
    </p>
  </section>
</div>

<style>
  .stack {
    max-width: 760px;
  }

  h2 {
    margin: 0;
  }

  .error {
    color: var(--danger);
    margin: 0;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  .help {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  code {
    background: var(--surface-2);
    padding: 0 0.3em;
    border-radius: 3px;
  }
</style>
