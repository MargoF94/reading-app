<script lang="ts">
  import { onMount } from 'svelte';
  import { cleanPassword, isEmail, mailServer, setUpKindle, turnOffKindle } from '../lib/kindle.svelte';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { toasts } from '../lib/toast.svelte';

  // One-time setup for "Send to Kindle" on files (see lib/kindle.svelte.ts).
  const saved = $derived(library.settings.kindle);

  let section: HTMLElement | undefined = $state();
  let editing = $state(false);
  let to = $state('');
  let from = $state('');
  let password = $state('');
  let server = $state('');
  let busy = $state(false);
  let error = $state('');

  const known = $derived(mailServer(from));
  const chosenServer = $derived(known ?? server.trim());
  // A new account (or server) needs its app password; otherwise the stored one stays.
  const needsPassword = $derived(
    !saved || from.trim().toLowerCase() !== saved.from.toLowerCase() || chosenServer !== saved.server,
  );

  onMount(() => {
    // From a file's "Send to Kindle" before it was set up.
    if (router.route.query.get('show') === 'kindle') section?.scrollIntoView({ block: 'start' });
  });

  function edit() {
    to = saved?.to ?? '';
    from = saved?.from ?? '';
    server = saved && !mailServer(saved.from) ? saved.server : '';
    password = '';
    error = '';
    editing = true;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const cfg = sync.config;
    if (!cfg) return;
    error = '';
    if (!isEmail(to)) error = 'Enter your Kindle’s email address (step 1).';
    else if (!isEmail(from)) error = 'Enter the email address you’ll send from (step 2).';
    else if (!/^[^\s:]+:\d+$/.test(chosenServer)) error = 'Enter the mail server as name:port, like smtp.example.com:587.';
    else if (needsPassword && !password.trim()) error = `Enter the app password for ${from.trim()} (step 3).`;
    if (error) return;
    busy = true;
    try {
      const pw = password.trim() ? cleanPassword(password, chosenServer) : undefined;
      await setUpKindle(cfg, { to, from, server: chosenServer, password: pw });
      editing = false;
      password = '';
      toasts.show('Send to Kindle is ready. Find it next to EPUBs on a book’s or fic’s page.');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function turnOff() {
    if (!confirm('Turn off Send to Kindle? The app password is removed from your data repository.')) return;
    await turnOffKindle(sync.config);
    toasts.show('Send to Kindle is off.');
  }
</script>

<section class="card stack" id="kindle" bind:this={section}>
  <h2>Send to Kindle</h2>
  {#if !sync.config}
    <p class="small muted">
      Send EPUBs to your Kindle with one tap. It works through your data repository, so connect Sync above first.
    </p>
  {:else if saved && !editing}
    <p>
      Ready. Files go from <strong>{saved.from}</strong> to <strong>{saved.to}</strong>.
      <br /><span class="small muted">
        Use “Send to Kindle” next to an EPUB on a book’s or fic’s page. Amazon sometimes emails you a “Verify your Kindle
        document” link first: tap it, and the file arrives.
      </span>
    </p>
    <div class="row">
      <button type="button" class="btn" onclick={edit}>Change</button>
      <button type="button" class="btn ghost" onclick={turnOff}>Turn off</button>
    </div>
  {:else}
    <p class="small">
      Send EPUBs to your Kindle with one tap. They go by email from your own email account. The app has no server, so a
      small workflow in your data repository on GitHub sends them. Set it up once:
    </p>
    <form class="stack" onsubmit={save} novalidate>
      <ol class="steps">
        <li>
          <p class="small">
            <strong>Find your Kindle’s email address.</strong> On Amazon (<a
              href="https://www.amazon.com/mycd"
              target="_blank"
              rel="noopener">amazon.com</a
            >, or your country’s Amazon): Account → Manage Your Content and Devices → Preferences → Personal Document
            Settings.
          </p>
          <label class="field">
            <span>Kindle’s email address</span>
            <input type="email" bind:value={to} autocapitalize="off" autocomplete="off" placeholder="name_abc123@kindle.com" />
          </label>
        </li>
        <li>
          <p class="small">
            <strong>Approve the address you’ll send from.</strong> On the same Amazon page, add it to the
            <em>Approved Personal Document E-mail List</em>. Amazon ignores mail from anyone else.
          </p>
          <label class="field">
            <span>Your email address</span>
            <input type="email" bind:value={from} autocapitalize="off" autocomplete="email" placeholder="you@gmail.com" />
          </label>
          {#if isEmail(from) && !known}
            <label class="field">
              <span>Its mail server</span>
              <input bind:value={server} autocapitalize="off" autocomplete="off" placeholder="smtp.example.com:587" />
              <span class="small muted">Your email provider’s outgoing (SMTP) server and port.</span>
            </label>
          {/if}
        </li>
        <li>
          <p class="small">
            <strong>Make an app password</strong> for that account, so the app never needs your real password.
            {#if known?.startsWith('smtp.mail.me.com')}
              On <a href="https://account.apple.com" target="_blank" rel="noopener">account.apple.com</a>: Sign-In and
              Security → App-Specific Passwords.
            {:else if known?.startsWith('smtp.mail.yahoo.com')}
              On Yahoo: Account Info → Account security → Generate app password.
            {:else}
              Gmail: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener"
                >Google Account → App passwords</a
              > (needs 2-Step Verification on). iCloud: account.apple.com → Sign-In and Security → App-Specific Passwords.
            {/if}
          </p>
          <label class="field">
            <span>App password{saved && !needsPassword ? ' (leave empty to keep the saved one)' : ''}</span>
            <input type="password" bind:value={password} autocomplete="off" />
          </label>
        </li>
        <li>
          <p class="small">
            <strong>Let your GitHub token set it up.</strong> On GitHub: profile picture → Settings → Developer settings →
            Personal access tokens → Fine-grained tokens → your token → Edit. Under Repository permissions set
            <strong>Actions</strong>, <strong>Secrets</strong> and <strong>Workflows</strong> to “Read and write”, then
            Update. The token itself stays the same. (If you make a new token instead, paste it under Sync → Replace the
            token.)
          </p>
        </li>
      </ol>
      <p class="small muted">The app password goes straight to GitHub, encrypted. This app doesn’t keep it.</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="row">
        <button class="btn primary" disabled={busy}>{busy ? 'Setting up…' : saved ? 'Save' : 'Set up'}</button>
        {#if saved}<button type="button" class="btn ghost" disabled={busy} onclick={() => (editing = false)}>Cancel</button>{/if}
      </div>
    </form>
  {/if}
</section>

<style>
  .stack {
    max-width: 760px;
  }

  h2,
  p {
    margin: 0;
  }

  .steps {
    margin: 0;
    padding-left: 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .steps li > * + * {
    margin-top: 0.5rem;
  }

  .error {
    color: var(--danger);
  }
</style>
