<script lang="ts">
  import { onMount } from 'svelte';
  import BookLookup from '../components/BookLookup.svelte';
  import Combobox, { type Option } from '../components/Combobox.svelte';
  import CoverField from '../components/CoverField.svelte';
  import FicImport from '../components/FicImport.svelte';
  import Icon from '../components/Icon.svelte';
  import StarRating from '../components/StarRating.svelte';
  import { discardCover, isRepoCover, saveCover } from '../lib/covers';
  import { loadDraft, saveDraft, type ItemDraft } from '../lib/drafts';
  import { convert, withRates } from '../lib/fx';
  import { cleanIsbn, validIsbn10, validIsbn13 } from '../lib/isbn';
  import {
    AO3_CATEGORIES,
    AO3_RATINGS,
    AO3_WARNINGS,
    CURRENCIES,
    FORMATS,
    LANGUAGES,
    PINNED_LANGUAGES,
    PURCHASE_SOURCES,
  } from '../lib/constants';
  import { router } from '../lib/router.svelte';
  import { library, type NamedCollection } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Ao3Rating, BookFormat, Currency, Item, ItemType, Purchase, Status } from '../lib/types';
  import { ao3WorkId, collator, formatDate, formatMoney, newId, normalize, nowIso, parseNumber, today } from '../lib/util';

  let {
    id = undefined,
    type: initialType = 'book',
    draftId = undefined,
  }: { id?: string; type?: ItemType; draftId?: string } = $props();

  // The page is re-created per item (see App.svelte), so reading props once is fine.
  // svelte-ignore state_referenced_locally
  const existing = id ? library.item(id) : undefined;
  const isNew = !existing;
  const itemId = existing?.id ?? newId();
  // svelte-ignore state_referenced_locally
  const draft = loadDraft(draftId);
  // ---- form state (numbers kept as strings while editing) ----
  // svelte-ignore state_referenced_locally
  let type = $state<ItemType>(existing?.type ?? initialType);
  let title = $state(existing?.title ?? '');
  let originalTitle = $state(existing?.originalTitle ?? '');
  let titleReading = $state(existing?.titleReading ?? '');
  let authorIds = $state<string[]>(existing?.authorIds ?? []);
  let language = $state<string | undefined>(existing?.language);
  let originalLanguage = $state<string | undefined>(existing?.originalLanguage);
  let seriesId = $state<string | undefined>(existing?.seriesId);
  let seriesNumber = $state(existing?.seriesNumber ?? '');
  let description = $state(existing?.description ?? '');
  let coverUrl = $state(existing?.coverUrl ?? '');
  let genreIds = $state<string[]>(existing?.genreIds ?? []);
  let tagIds = $state<string[]>(existing?.tagIds ?? []);
  let rating = $state<number | undefined>(existing?.rating);
  let review = $state(existing?.review ?? '');
  let reviewSpoiler = $state(existing?.reviewSpoiler ?? false);
  let notes = $state(existing?.notes ?? '');
  let wordCount = $state(existing?.wordCount?.toString() ?? '');

  const b = existing?.book;
  let format = $state<BookFormat | ''>(b?.format ?? '');
  let pageCount = $state(b?.pageCount?.toString() ?? '');
  let durH = $state(b?.durationMinutes ? String(Math.floor(b.durationMinutes / 60)) : '');
  let durM = $state(b?.durationMinutes ? String(b.durationMinutes % 60) : '');
  let narrator = $state(b?.narrator ?? '');
  let publisherId = $state<string | undefined>(b?.publisherId);
  let publicationDate = $state(b?.publicationDate ?? '');
  let originalYear = $state(b?.originalPublicationYear?.toString() ?? '');
  let isbn13 = $state(b?.isbn13 ?? '');
  let isbn10 = $state(b?.isbn10 ?? '');
  let goodreadsUrl = $state(b?.goodreadsUrl ?? '');
  let purchases = $state<Purchase[]>(b?.purchases ? structuredClone(b.purchases) : []);

  const f = existing?.fic;
  let ficUrl = $state(f?.url ?? '');
  let ficRating = $state<Ao3Rating | ''>(f?.rating ?? '');
  let warnings = $state<string[]>(f?.warnings ?? []);
  let categories = $state<string[]>(f?.categories ?? []);
  let fandoms = $state<string[]>(f?.fandoms ?? []);
  let relationships = $state<string[]>(f?.relationships ?? []);
  let characters = $state<string[]>(f?.characters ?? []);
  let additionalTags = $state<string[]>(f?.additionalTags ?? []);
  let publishedDate = $state(f?.publishedDate ?? '');
  let updatedDate = $state(f?.updatedDate ?? '');
  let completedDate = $state(f?.completedDate ?? '');
  let complete = $state(f?.complete ?? false);
  let chaptersAvailable = $state(f?.chaptersAvailable?.toString() ?? '');
  let chaptersTotal = $state(f?.chaptersTotal?.toString() ?? '');
  let kudos = $state(f?.kudos?.toString() ?? '');
  let hits = $state(f?.hits?.toString() ?? '');
  let bookmarks = $state(f?.bookmarks?.toString() ?? '');
  let comments = $state(f?.comments?.toString() ?? '');

  let photo = $state<Blob | null>(null);
  let initialStatus = $state<Status>('want-to-read');
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let banner = $state('');

  // ---- reference data: new names are created only when the form is saved ----
  const NEW = 'new:';
  let pending = $state<Record<string, string[]>>({});

  function optionsFor(coll: NamedCollection): Option[] {
    const opts = library.named(coll).map((r) => ({ value: r.id, label: r.name }));
    for (const name of pending[coll] ?? []) opts.push({ value: NEW + name, label: name });
    return opts;
  }

  function creator(coll: NamedCollection) {
    return (label: string) => {
      pending[coll] = [...(pending[coll] ?? []), label];
      return NEW + label;
    };
  }

  async function resolve(coll: NamedCollection, value: string): Promise<string> {
    return value.startsWith(NEW) ? library.ensureNamed(coll, value.slice(NEW.length)) : value;
  }

  const languageOptions: Option[] = [
    ...LANGUAGES.slice(0, PINNED_LANGUAGES),
    ...LANGUAGES.slice(PINNED_LANGUAGES).sort((a, b2) => collator.compare(a.name, b2.name)),
  ].map((l) => ({ value: l.code, label: l.name }));

  const freeOptions = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));
  const keep = (label: string) => label;

  const isAudio = $derived(format === 'audiobook');

  onMount(() => {
    if (router.route.query.get('focus') === 'review') {
      document.getElementById('review')?.scrollIntoView({ block: 'center' });
    }
  });

  // ---- pre-filled data from lookups and imports ----

  /** Existing record id for a name (authors also match their other-script names), or a pending new one. */
  function valueForName(coll: NamedCollection, name: string): string {
    const key = normalize(name);
    const found = library.named(coll).find(
      (r) => normalize(r.name) === key || ('altNames' in r && (r.altNames as string[]).some((n) => normalize(n) === key)),
    );
    if (found) return found.id;
    if (!(pending[coll] ?? []).some((n) => normalize(n) === key)) pending[coll] = [...(pending[coll] ?? []), name];
    return NEW + (pending[coll] ?? []).find((n) => normalize(n) === key);
  }

  /**
   * Copies draft values into the form. With `overwrite` false only empty fields
   * are filled, so nothing typed by hand (or saved before) is lost.
   */
  function applyDraft(d: ItemDraft, overwrite: boolean) {
    const want = (current: unknown) => overwrite || current === '' || current === undefined || (Array.isArray(current) && !current.length);
    const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
    if (d.title && want(title)) title = d.title;
    if (d.originalTitle && want(originalTitle)) originalTitle = d.originalTitle;
    if (d.titleReading && want(titleReading)) titleReading = d.titleReading;
    if (d.authors?.length && want(authorIds)) authorIds = [...new Set(d.authors.map((a) => valueForName('authors', a)))];
    if (d.language && want(language)) language = d.language;
    if (d.series && want(seriesId)) {
      seriesId = valueForName('series', d.series);
      seriesNumber = d.seriesNumber ?? '';
    }
    if (d.description && want(description)) description = d.description;
    if (d.coverUrl && !photo && want(coverUrl)) coverUrl = d.coverUrl;
    if (d.genres?.length) genreIds = [...new Set([...genreIds, ...d.genres.map((g) => valueForName('genres', g))])];
    if (d.tags?.length) tagIds = [...new Set([...tagIds, ...d.tags.map((t) => valueForName('tags', t))])];
    if (d.wordCount !== undefined && want(wordCount)) wordCount = String(d.wordCount);
    const bk = d.book;
    if (bk) {
      if (bk.isbn13 && want(isbn13)) isbn13 = bk.isbn13;
      if (bk.isbn10 && want(isbn10)) isbn10 = bk.isbn10;
      if (bk.publisher && want(publisherId)) publisherId = valueForName('publishers', bk.publisher);
      if (bk.publicationDate && want(publicationDate)) publicationDate = bk.publicationDate;
      if (bk.format && want(format)) format = bk.format;
      if (bk.pageCount && want(pageCount)) pageCount = String(bk.pageCount);
      if (bk.goodreadsUrl && want(goodreadsUrl)) goodreadsUrl = bk.goodreadsUrl;
      if (bk.originalPublicationYear && want(originalYear)) originalYear = String(bk.originalPublicationYear);
    }
    const fc = d.fic;
    if (fc) {
      if (fc.url && want(ficUrl)) ficUrl = fc.url;
      if (fc.rating && want(ficRating)) ficRating = fc.rating;
      if (fc.warnings?.length && want(warnings)) warnings = [...fc.warnings];
      if (fc.categories?.length && want(categories)) categories = [...fc.categories];
      if (fc.fandoms?.length && want(fandoms)) fandoms = [...fc.fandoms];
      if (fc.relationships?.length && want(relationships)) relationships = [...fc.relationships];
      if (fc.characters?.length && want(characters)) characters = [...fc.characters];
      if (fc.additionalTags?.length && want(additionalTags)) additionalTags = [...fc.additionalTags];
      if (fc.publishedDate && want(publishedDate)) publishedDate = fc.publishedDate;
      if (fc.updatedDate && want(updatedDate)) updatedDate = fc.updatedDate;
      if (fc.completedDate && want(completedDate)) completedDate = fc.completedDate;
      if (fc.complete !== undefined && overwrite) complete = fc.complete;
      if (fc.chaptersAvailable !== undefined && want(chaptersAvailable)) chaptersAvailable = String(fc.chaptersAvailable);
      if (overwrite || !chaptersTotal) chaptersTotal = str(fc.chaptersTotal) ?? '';
      if (fc.kudos !== undefined) kudos = String(fc.kudos);
      if (fc.hits !== undefined) hits = String(fc.hits);
      if (fc.bookmarks !== undefined) bookmarks = String(fc.bookmarks);
      if (fc.comments !== undefined) comments = String(fc.comments);
      if (fc.statsDate) statsDate = fc.statsDate;
    }
  }

  // svelte-ignore state_referenced_locally
  let statsDate = $state(f?.statsDate);

  if (draft) {
    // New items take everything; an existing fic re-imported from AO3 takes the new
    // metadata; an existing book only gets its gaps filled.
    const overwrite = isNew || draft.type === 'fic';
    const before = { chapters: existing?.fic?.chaptersAvailable, words: existing?.wordCount };
    if (isNew) type = draft.type;
    applyDraft(draft, overwrite);
    if (isNew) banner = `Filled in from ${draft.source ?? 'the import'}. Check the details and save.`;
    else if (draft.type === 'fic') {
      const changes = [];
      if (draft.fic?.chaptersAvailable !== undefined && draft.fic.chaptersAvailable !== before.chapters)
        changes.push(`chapters ${before.chapters ?? '?'} → ${draft.fic.chaptersAvailable}`);
      if (draft.wordCount !== undefined && draft.wordCount !== before.words)
        changes.push(`words ${before.words?.toLocaleString('en-US') ?? '?'} → ${draft.wordCount.toLocaleString('en-US')}`);
      banner = `Updated from AO3${changes.length ? ': ' + changes.join(', ') : ' (no changes in chapters or words)'}. Save to keep it.`;
    } else banner = `Filled in missing details from ${draft.source ?? 'the import'}. Save to keep them.`;
  }

  /** A fic from an AO3 file: if it's already in the library, offer to update that one instead. */
  function ficImported(d: ItemDraft) {
    const dup = isNew ? library.ficByWorkId(d.fic?.workId) : undefined;
    if (dup && confirm(`“${dup.title}” is already in your library. Update it with the new details instead?`)) {
      router.go(`/item/${dup.id}/edit?draft=${saveDraft(d)}`, true);
      return;
    }
    applyDraft(d, true);
  }
  // ---- validation helpers ----
  function num(v: string, field: string, errs: Record<string, string>): number | undefined {
    if (v.trim() === '') return undefined;
    const n = parseNumber(v);
    if (n === undefined || n < 0) errs[field] = 'Enter a positive number.';
    return n;
  }

  async function save(e: Event) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required.';

    const i13 = cleanIsbn(isbn13);
    const i10 = cleanIsbn(isbn10);
    if (type === 'book') {
      if (i13 && !validIsbn13(i13)) errs.isbn13 = 'This doesn’t look like a valid ISBN-13.';
      if (i10 && !validIsbn10(i10)) errs.isbn10 = 'This doesn’t look like a valid ISBN-10.';
      if (publicationDate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(publicationDate))
        errs.publicationDate = 'Use YYYY, YYYY-MM or YYYY-MM-DD.';
      if (originalYear && !/^\d{1,4}$/.test(originalYear.trim())) errs.originalYear = 'Enter a year, e.g. 1987.';
    }
    const words = num(wordCount, 'wordCount', errs);
    const pages = num(pageCount, 'pageCount', errs);
    const chAvail = num(chaptersAvailable, 'chapters', errs);
    const chTotal = num(chaptersTotal, 'chapters', errs);
    const durationMinutes =
      durH || durM ? (num(durH, 'duration', errs) ?? 0) * 60 + (num(durM, 'duration', errs) ?? 0) : undefined;
    for (const p of purchases) {
      if (p.price !== undefined && (!Number.isFinite(p.price) || p.price < 0)) errs.purchases = 'Check the prices.';
    }
    errors = errs;
    if (Object.keys(errs).length) {
      document.querySelector('.error')?.scrollIntoView({ block: 'center' });
      return;
    }

    // Duplicate check for new items.
    if (isNew) {
      const workId = ao3WorkId(ficUrl);
      const dup = library.items.find(
        (it) =>
          (type === 'book' && i13 && it.book?.isbn13 === i13) ||
          (type === 'fic' && workId && it.fic?.workId === workId),
      );
      if (dup && !confirm(`“${dup.title}” is already in your library. Add it again anyway?`)) return;
    }

    saving = true;
    try {
      const now = nowIso();
      // Cover: a new photo is stored as a file; a replaced uploaded photo is cleaned up.
      let finalCover = coverUrl.trim() || undefined;
      if (photo) finalCover = await saveCover(itemId, photo);
      if (existing?.coverUrl && isRepoCover(existing.coverUrl) && existing.coverUrl !== finalCover) {
        await discardCover(existing.coverUrl);
      }
      // Exchange rates for new prices (skipped quietly if offline or slow).
      let finalPurchases: Purchase[] = $state.snapshot(purchases).map((p) => ({ ...p, store: p.store?.trim() || undefined }));
      if (type === 'book' && finalPurchases.some((p) => p.price !== undefined && !p.fx) && navigator.onLine) {
        finalPurchases = await Promise.race([
          withRates(finalPurchases),
          new Promise<Purchase[]>((r) => setTimeout(() => r(finalPurchases), 6000)),
        ]);
      }
      const item: Item = {
        id: itemId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        type,
        title: title.trim(),
        originalTitle: originalTitle.trim() || undefined,
        titleReading: titleReading.trim() || undefined,
        authorIds: await Promise.all(authorIds.map((v) => resolve('authors', v))),
        language,
        originalLanguage,
        genreIds: await Promise.all(genreIds.map((v) => resolve('genres', v))),
        tagIds: await Promise.all(tagIds.map((v) => resolve('tags', v))),
        seriesId: seriesId ? await resolve('series', seriesId) : undefined,
        seriesNumber: seriesId ? seriesNumber.trim() || undefined : undefined,
        description: description.trim() || undefined,
        coverUrl: finalCover,
        rating,
        review: review.trim() || undefined,
        reviewSpoiler: review.trim() ? reviewSpoiler : undefined,
        notes: notes.trim() || undefined,
        wordCount: words,
        wordCountEstimated: words !== undefined && type === 'book' ? true : undefined,
      };
      if (type === 'book') {
        item.book = {
          format: format || undefined,
          pageCount: pages,
          durationMinutes: isAudio ? durationMinutes : undefined,
          narrator: isAudio ? narrator.trim() || undefined : undefined,
          publisherId: publisherId ? await resolve('publishers', publisherId) : undefined,
          publicationDate: publicationDate || undefined,
          originalPublicationYear: originalYear.trim() ? Number(originalYear) : undefined,
          isbn13: i13 || undefined,
          isbn10: i10 || undefined,
          goodreadsUrl: goodreadsUrl.trim() || undefined,
          purchases: finalPurchases,
        };
      } else {
        item.wordCountEstimated = undefined;
        item.fic = {
          site: 'ao3',
          url: ficUrl.trim() || undefined,
          workId: ao3WorkId(ficUrl),
          rating: ficRating || undefined,
          warnings: [...warnings],
          categories: [...categories],
          fandoms: [...fandoms],
          relationships: [...relationships],
          characters: [...characters],
          additionalTags: [...additionalTags],
          publishedDate: publishedDate || undefined,
          updatedDate: updatedDate || undefined,
          completedDate: completedDate || undefined,
          complete,
          chaptersAvailable: chAvail,
          chaptersTotal: chTotal,
          kudos: parseNumber(kudos),
          hits: parseNumber(hits),
          bookmarks: parseNumber(bookmarks),
          comments: parseNumber(comments),
          statsDate,
        };
      }
      await library.saveItem(item);
      if (isNew && initialStatus !== 'want-to-read') await library.setStatus(item, initialStatus);
      toasts.show(isNew ? 'Added to your library.' : 'Saved.');
      router.go(`/item/${item.id}`, true);
    } finally {
      saving = false;
    }
  }

  const other = (c: Currency): Currency => (c === 'JPY' ? 'USD' : 'JPY');

  function fxLine(p: Purchase): string {
    if (p.price === undefined) return '';
    if (!p.fx) return 'The exchange rate is looked up when you save.';
    const to = other(p.currency);
    const v = convert(p.price, p.currency, to, p.fx);
    const jpy = p.fx.perUsd.JPY;
    return v === undefined || !jpy
      ? ''
      : `≈ ${formatMoney(v, to)} at ¥${jpy.toFixed(2)} per $1 (${p.fx.manual ? 'your rate' : formatDate(p.fx.date)})`;
  }

  function setRate(p: Purchase, value: string) {
    const jpy = parseNumber(value);
    p.fx = jpy && jpy > 0 ? { date: p.date ?? today(), perUsd: { USD: 1, JPY: jpy }, manual: true } : undefined;
  }

  function addPurchase() {
    purchases.push({
      id: newId(),
      currency: library.settings.displayCurrency,
      source: 'bought',
      date: undefined,
    });
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }
</script>

<div class="top">
  <button type="button" class="btn ghost small" onclick={() => router.back(existing ? `/item/${existing.id}` : '/')}>
    <Icon name="back" size={18} /> Cancel
  </button>
</div>

<h1>{isNew ? (type === 'fic' ? 'Add a fic' : 'Add a book') : `Edit ${type === 'fic' ? 'fic' : 'book'}`}</h1>

{#if banner}<p class="banner" role="status">{banner}</p>{/if}
{#if isNew && !draft}
  <p class="small muted import-hint">
    Moving from Goodreads, or adding from AO3 in one click? See <a href="#/import">Import</a>.
  </p>
{/if}

<form class="stack" onsubmit={save} novalidate>
  {#if isNew}
    <div class="type-switch" role="radiogroup" aria-label="Type">
      <label class:on={type === 'book'}>
        <input type="radio" bind:group={type} value="book" class="visually-hidden" /> Book / manga / audiobook
      </label>
      <label class:on={type === 'fic'}>
        <input type="radio" bind:group={type} value="fic" class="visually-hidden" /> Fanfic (AO3)
      </label>
    </div>
  {/if}

  {#if type === 'book'}
    <BookLookup onpick={(d) => applyDraft(d, isNew)} initial={isbn13} />
  {:else}
    <FicImport onimport={ficImported} />
  {/if}

  <fieldset class="card stack">
    <legend>Basics</legend>
    <label class="field">
      <span>Title *</span>
      <input bind:value={title} required aria-invalid={!!errors.title} />
      {#if errors.title}<span class="error">{errors.title}</span>{/if}
    </label>
    {#if type === 'book'}
      <div class="grid-2">
        <label class="field">
          <span>Original title</span>
          <input bind:value={originalTitle} placeholder="e.g. 1Q84 / Мастер и Маргарита" />
        </label>
        <label class="field">
          <span>Title reading / romanisation</span>
          <input bind:value={titleReading} placeholder="e.g. いちきゅうはちよん" />
        </label>
      </div>
    {/if}
    <div class="field">
      <label class="label" for="f-authors">{type === 'fic' ? 'Author(s)' : 'Author(s)'}</label>
      <Combobox
        id="f-authors"
        multiple
        options={optionsFor('authors')}
        values={authorIds}
        onchangeMany={(v) => (authorIds = v)}
        oncreate={creator('authors')}
        placeholder="Type a name…"
      />
    </div>
    <div class="grid-2">
      <div class="field">
        <label class="label" for="f-lang">Language</label>
        <Combobox id="f-lang" options={languageOptions} value={language} onchange={(v) => (language = v)} placeholder="Choose…" />
      </div>
      {#if type === 'book'}
        <div class="field">
          <label class="label" for="f-olang">Original language (if translated)</label>
          <Combobox
            id="f-olang"
            options={languageOptions}
            value={originalLanguage}
            onchange={(v) => (originalLanguage = v)}
            placeholder="Same as language"
          />
        </div>
      {/if}
    </div>
    <div class="grid-2 series">
      <div class="field">
        <label class="label" for="f-series">Series</label>
        <Combobox
          id="f-series"
          options={optionsFor('series')}
          value={seriesId}
          onchange={(v) => (seriesId = v)}
          oncreate={creator('series')}
          placeholder="None"
        />
      </div>
      <label class="field">
        <span>Number in series</span>
        <input bind:value={seriesNumber} disabled={!seriesId} placeholder="e.g. 2" inputmode="decimal" />
      </label>
    </div>
  </fieldset>

  {#if type === 'book'}
    <fieldset class="card stack">
      <legend>Edition</legend>
      <div class="grid-2">
        <label class="field">
          <span>Format</span>
          <select bind:value={format}>
            <option value="">—</option>
            {#each FORMATS as fm (fm.value)}<option value={fm.value}>{fm.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>{isAudio ? 'Pages (print edition)' : 'Pages'}</span>
          <input bind:value={pageCount} inputmode="numeric" aria-invalid={!!errors.pageCount} />
          {#if errors.pageCount}<span class="error">{errors.pageCount}</span>{/if}
        </label>
      </div>
      {#if isAudio}
        <div class="grid-3">
          <label class="field"><span>Length: hours</span><input bind:value={durH} inputmode="numeric" /></label>
          <label class="field"><span>Minutes</span><input bind:value={durM} inputmode="numeric" /></label>
          <label class="field"><span>Narrator</span><input bind:value={narrator} /></label>
        </div>
        {#if errors.duration}<span class="error">{errors.duration}</span>{/if}
      {/if}
      <div class="grid-2">
        <div class="field">
          <label class="label" for="f-pub">Publisher</label>
          <Combobox
            id="f-pub"
            options={optionsFor('publishers')}
            value={publisherId}
            onchange={(v) => (publisherId = v)}
            oncreate={creator('publishers')}
            placeholder="Choose or add…"
          />
        </div>
        <label class="field">
          <span>Publication date</span>
          <input bind:value={publicationDate} placeholder="YYYY or YYYY-MM-DD" aria-invalid={!!errors.publicationDate} />
          {#if errors.publicationDate}<span class="error">{errors.publicationDate}</span>{/if}
        </label>
      </div>
      <div class="grid-2">
        <label class="field">
          <span>ISBN-13</span>
          <input bind:value={isbn13} inputmode="numeric" aria-invalid={!!errors.isbn13} />
          {#if errors.isbn13}<span class="error">{errors.isbn13}</span>{/if}
        </label>
        <label class="field">
          <span>ISBN-10</span>
          <input bind:value={isbn10} aria-invalid={!!errors.isbn10} />
          {#if errors.isbn10}<span class="error">{errors.isbn10}</span>{/if}
        </label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Goodreads link</span><input type="url" bind:value={goodreadsUrl} placeholder="https://www.goodreads.com/book/show/…" /></label>
        <label class="field">
          <span>First published (year)</span>
          <input bind:value={originalYear} inputmode="numeric" placeholder="If different from this edition" aria-invalid={!!errors.originalYear} />
          {#if errors.originalYear}<span class="error">{errors.originalYear}</span>{/if}
        </label>
      </div>
      <label class="field">
        <span>Word count (optional)</span>
        <input bind:value={wordCount} inputmode="numeric" aria-invalid={!!errors.wordCount} />
        {#if errors.wordCount}<span class="error">{errors.wordCount}</span>{/if}
      </label>
    </fieldset>
  {:else}
    <fieldset class="card stack">
      <legend>Fic details</legend>
      <label class="field">
        <span>AO3 link</span>
        <input type="url" bind:value={ficUrl} placeholder="https://archiveofourown.org/works/…" />
      </label>
      <div class="grid-2">
        <label class="field">
          <span>Content rating</span>
          <select bind:value={ficRating}>
            <option value="">—</option>
            {#each AO3_RATINGS as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Words</span>
          <input bind:value={wordCount} inputmode="numeric" aria-invalid={!!errors.wordCount} />
          {#if errors.wordCount}<span class="error">{errors.wordCount}</span>{/if}
        </label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Chapters posted</span><input bind:value={chaptersAvailable} inputmode="numeric" /></label>
        <label class="field"><span>Total chapters</span><input bind:value={chaptersTotal} inputmode="numeric" placeholder="? if unknown" /></label>
        <label class="check complete"><input type="checkbox" bind:checked={complete} /> Complete</label>
      </div>
      {#if errors.chapters}<span class="error">{errors.chapters}</span>{/if}
      <div class="grid-3">
        <label class="field"><span>Published</span><input type="date" bind:value={publishedDate} /></label>
        <label class="field"><span>Updated</span><input type="date" bind:value={updatedDate} /></label>
        <label class="field"><span>Completed</span><input type="date" bind:value={completedDate} /></label>
      </div>
      <div>
        <span class="label">Archive warnings</span>
        <div class="checks">
          {#each AO3_WARNINGS as w (w)}
            <label class="check"><input type="checkbox" checked={warnings.includes(w)} onchange={() => (warnings = toggle(warnings, w))} /> {w}</label>
          {/each}
        </div>
      </div>
      <div>
        <span class="label">Categories</span>
        <div class="checks inline">
          {#each AO3_CATEGORIES as c (c)}
            <label class="check"><input type="checkbox" checked={categories.includes(c)} onchange={() => (categories = toggle(categories, c))} /> {c}</label>
          {/each}
        </div>
      </div>
      {#each [['Fandoms', 'fandoms'], ['Relationships', 'relationships'], ['Characters', 'characters'], ['Additional tags', 'additionalTags']] as const as [label, key] (key)}
        <div class="field">
          <label class="label" for="f-{key}">{label}</label>
          <Combobox
            id="f-{key}"
            multiple
            options={freeOptions(library.ficValues(key))}
            values={key === 'fandoms' ? fandoms : key === 'relationships' ? relationships : key === 'characters' ? characters : additionalTags}
            onchangeMany={(v) => {
              if (key === 'fandoms') fandoms = v;
              else if (key === 'relationships') relationships = v;
              else if (key === 'characters') characters = v;
              else additionalTags = v;
            }}
            oncreate={keep}
            placeholder="Type and press Enter…"
          />
        </div>
      {/each}
      <details>
        <summary class="small">AO3 stats (optional)</summary>
        <div class="grid-2" style="margin-top:0.75rem">
          <label class="field"><span>Kudos</span><input bind:value={kudos} inputmode="numeric" /></label>
          <label class="field"><span>Hits</span><input bind:value={hits} inputmode="numeric" /></label>
          <label class="field"><span>Bookmarks</span><input bind:value={bookmarks} inputmode="numeric" /></label>
          <label class="field"><span>Comments</span><input bind:value={comments} inputmode="numeric" /></label>
        </div>
      </details>
    </fieldset>
  {/if}

  <fieldset class="card stack">
    <legend>{type === 'fic' ? 'Summary & shelving' : 'Description & shelving'}</legend>
    <CoverField
      item={{ ...(existing ?? ({ id: itemId, createdAt: '', updatedAt: '', genreIds: [], tagIds: [] } as unknown as Item)), type, title: title || 'Untitled', authorIds }}
      bind:coverUrl
      bind:photo
    />
    <label class="field">
      <span>{type === 'fic' ? 'Summary' : 'Description'}</span>
      <textarea bind:value={description} rows="5"></textarea>
    </label>
    <div class="field">
      <label class="label" for="f-genres">Genres</label>
      <Combobox
        id="f-genres"
        multiple
        options={optionsFor('genres')}
        values={genreIds}
        onchangeMany={(v) => (genreIds = v)}
        oncreate={creator('genres')}
        placeholder="e.g. Fantasy, Romance…"
      />
    </div>
    <div class="field">
      <label class="label" for="f-tags">Tags</label>
      <Combobox
        id="f-tags"
        multiple
        options={optionsFor('tags')}
        values={tagIds}
        onchangeMany={(v) => (tagIds = v)}
        oncreate={creator('tags')}
        placeholder="e.g. 2026, paperback, favourites…"
      />
    </div>
    {#if isNew}
      <label class="field">
        <span>Add to shelf</span>
        <select bind:value={initialStatus}>
          <option value="want-to-read">Want to Read</option>
          <option value="currently-reading">Currently Reading (started today)</option>
          <option value="read">Read (finished today)</option>
        </select>
      </label>
    {/if}
  </fieldset>

  {#if type === 'book'}
    <fieldset class="card stack">
      <legend>Purchases</legend>
      {#if purchases.length === 0}
        <p class="muted small" style="margin:0">Track what you paid, or mark it as free, library or gift.</p>
      {/if}
      {#each purchases as p, i (p.id)}
        <div class="purchase">
          <div class="grid-3">
            <label class="field">
              <span>Price</span>
              <input
                inputmode="decimal"
                value={p.price ?? ''}
                oninput={(e) => (p.price = parseNumber(e.currentTarget.value))}
              />
            </label>
            <label class="field">
              <span>Currency</span>
              <select bind:value={p.currency}>
                {#each CURRENCIES as c (c.value)}<option value={c.value}>{c.symbol} {c.value}</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Source</span>
              <select bind:value={p.source}>
                {#each PURCHASE_SOURCES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
              </select>
            </label>
            <label class="field">
              <span>Date</span>
              <input
                type="date"
                value={p.date ?? ''}
                onchange={(e) => {
                  p.date = e.currentTarget.value || undefined;
                  if (!p.fx?.manual) p.fx = undefined;
                }}
              />
            </label>
            <label class="field">
              <span>Store</span>
              <input value={p.store ?? ''} oninput={(e) => (p.store = e.currentTarget.value)} placeholder="e.g. Amazon JP" />
            </label>
            <div class="field remove">
              <button type="button" class="btn danger" onclick={() => purchases.splice(i, 1)}>
                <Icon name="trash" size={16} /> Remove
              </button>
            </div>
          </div>
          {#if p.price !== undefined}
            <div class="fx small muted">
              <span>{fxLine(p)}</span>
              <details>
                <summary>Set the rate yourself</summary>
                <label class="field rate">
                  <span>Yen per 1 US dollar</span>
                  <input
                    inputmode="decimal"
                    value={p.fx?.perUsd.JPY ?? ''}
                    placeholder="e.g. 147.5"
                    onchange={(e) => setRate(p, e.currentTarget.value)}
                  />
                </label>
              </details>
            </div>
          {/if}
        </div>
      {/each}
      {#if errors.purchases}<span class="error">{errors.purchases}</span>{/if}
      <div><button type="button" class="btn small" onclick={addPurchase}>+ Add purchase</button></div>
    </fieldset>
  {/if}

  <fieldset class="card stack" id="review">
    <legend>Rating & review</legend>
    <div>
      <span class="label">My rating</span>
      <StarRating value={rating} onchange={(v) => (rating = v)} size={30} />
    </div>
    <label class="field">
      <span>Review</span>
      <textarea bind:value={review} rows="7" placeholder="Markdown works: **bold**, *italic*, > quote. Hide a spoiler like ||this||."></textarea>
    </label>
    <label class="check"><input type="checkbox" bind:checked={reviewSpoiler} /> Whole review contains spoilers</label>
    <label class="field">
      <span>Private notes</span>
      <textarea bind:value={notes} rows="3"></textarea>
    </label>
  </fieldset>

  <div class="save-bar">
    <button type="button" class="btn" onclick={() => router.back(existing ? `/item/${existing.id}` : '/')}>Cancel</button>
    <button type="submit" class="btn primary" disabled={saving}>{isNew ? 'Add to library' : 'Save changes'}</button>
  </div>
</form>

<style>
  .top {
    margin-bottom: 0.5rem;
  }

  form {
    max-width: 760px;
  }

  fieldset {
    margin: 0;
    min-width: 0;
  }

  legend {
    font-weight: 700;
    padding: 0 0.4rem;
    margin-left: -0.4rem;
  }

  .type-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .type-switch label {
    text-align: center;
    padding: 0.7rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font-weight: 500;
  }

  .type-switch label.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .type-switch label:has(input:focus-visible) {
    outline: 2px solid var(--accent);
  }

  .error {
    color: var(--danger);
    font-size: 0.85rem;
  }

  .complete {
    align-self: end;
    min-height: 42px;
  }

  .checks {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.3rem;
  }

  .checks.inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem 1.2rem;
  }

  .purchase {
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .fx {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .fx summary {
    cursor: pointer;
    color: var(--accent);
  }

  .rate {
    max-width: 220px;
    margin-top: 0.4rem;
  }

  .banner {
    background: var(--accent-soft);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 0.7rem 0.9rem;
    margin: 0 0 1rem;
    max-width: 760px;
  }

  .import-hint {
    margin: -0.25rem 0 1rem;
  }

  .remove {
    justify-content: flex-end;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  .save-bar {
    position: sticky;
    bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 0;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
  }

  @media (min-width: 900px) {
    .save-bar {
      bottom: 0;
    }
  }
</style>
