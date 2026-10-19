// Sending files to a Kindle. Amazon takes documents by email at each Kindle's own address,
// from senders you approve. The app has no server, so the email goes out from a small
// workflow in your data repository on GitHub, through your own email account. That account's
// app password is kept there as an encrypted secret; the app itself never stores it.
import { coverWork } from './fileCovers';
import {
  checkRepo,
  deletePath,
  deleteSecret,
  dispatchWorkflow,
  failedStep,
  GitHubError,
  hasWorkflow,
  putSecret,
  putTextFile,
  workflowRun,
  type SyncConfig,
  type WorkflowRun,
} from './github';
import WORKFLOW from './sendToKindle.yml?raw';
import { library } from './store.svelte';
import { sync } from './sync.svelte';
import { toasts } from './toast.svelte';
import type { KindleSettings, StoredFile } from './types';
import { nowIso } from './util';

export const KINDLE_WORKFLOW = 'send-to-kindle.yml';
const WORKFLOW_PATH = `.github/workflows/${KINDLE_WORKFLOW}`;
export const KINDLE_SECRET = 'KINDLE_EMAIL_PASSWORD';
/** Bump with every change to sendToKindle.yml: repositories set up before get it on their next send. */
export const WORKFLOW_VERSION = 1;

/** What went wrong, by the step of the workflow that failed. */
export const STEP_ERRORS: Record<string, string> = {
  'Get the file':
    'The file isn’t in your data repository any more (it may have been replaced on another device). Sync, then try again.',
  'Sign in to the email account':
    'Your email account didn’t accept the sign-in. Check the email address and app password in Settings → Send to Kindle.',
  'Send the email':
    'Your email account couldn’t send it. Email has a size limit (25 MB with Gmail), so very large files can’t go this way.',
};
const FAILED = 'Sending didn’t work. GitHub has the details: your data repository → Actions → Send to Kindle.';

const DENIED = {
  workflows: 'GitHub didn’t let the app add the sender to your data repository. Give your token “Workflows: Read and write” (step 4).',
  secrets: 'GitHub didn’t let the app store the app password. Give your token “Secrets: Read and write” (step 4).',
  actions: 'GitHub didn’t let the app start sending. Give your token “Actions: Read and write” (see Settings → Send to Kindle).',
};

const START_ERRORS = {
  403: DENIED.actions,
  404: 'The sender isn’t in your data repository. Set up Send to Kindle again in Settings.',
  422: 'GitHub couldn’t start the sender. Set up Send to Kindle again in Settings.',
};

/** File types Amazon takes by email. */
export const canSendToKindle = (f: StoredFile): boolean => /\.(epub|pdf|txt|docx?|rtf|html?)$/i.test(f.name);

export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** The outgoing mail server ("host:port") of common email services; others are typed in. */
export function mailServer(address: string): string | undefined {
  const domain = address.trim().toLowerCase().split('@')[1] ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'smtp.gmail.com:465';
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') return 'smtp.mail.me.com:587';
  if (/^yahoo\.[a-z.]+$/.test(domain)) return 'smtp.mail.yahoo.com:465';
  return undefined;
}

/** App passwords as they're typed in; Google shows its own in groups of four letters. */
export const cleanPassword = (password: string, server: string): string =>
  server.startsWith('smtp.gmail.com') ? password.replace(/\s+/g, '') : password.trim();

/** What the workflow is told when it's started (its inputs). */
export const workflowInputs = (file: StoredFile, s: KindleSettings): Record<string, string> => ({
  path: file.path,
  name: file.name,
  to: s.to,
  from: s.from,
  server: s.server,
});

export interface KindleSetup {
  to: string;
  from: string;
  server: string;
  /** Only when it's new or changed. */
  password?: string;
}

/** Puts the sender into the data repository, stores the app password there, and saves the settings. */
export async function setUpKindle(cfg: SyncConfig, s: KindleSetup): Promise<void> {
  await checkRepo(cfg);
  await putTextFile(cfg, WORKFLOW_PATH, WORKFLOW, 'Add the Send to Kindle workflow', DENIED.workflows);
  if (s.password) await putSecret(cfg, KINDLE_SECRET, s.password, DENIED.secrets);
  // Starting it needs the "Actions" permission too. GitHub can take a moment to see a new workflow.
  for (let i = 0; i < 4 && !(await hasWorkflow(cfg, KINDLE_WORKFLOW, DENIED.actions)); i++) await wait(2000);
  await library.saveSettings({
    kindle: { to: s.to.trim(), from: s.from.trim(), server: s.server.trim(), workflow: WORKFLOW_VERSION },
  });
}

/** Stops sending: the settings go, and the sender and password leave the repository when the token may remove them. */
export async function turnOffKindle(cfg: SyncConfig | null): Promise<void> {
  if (cfg) {
    await deleteSecret(cfg, KINDLE_SECRET).catch(() => {});
    await deletePath(cfg, WORKFLOW_PATH, 'Remove the Send to Kindle workflow', 'the sender').catch(() => {});
  }
  await library.saveSettings({ kindle: undefined });
}

class KindleSender {
  /** Files on their way, by id. */
  sending = $state<Record<string, true>>({});

  /** Sends one of the item's files to the Kindle, and says how it went. */
  async send(itemId: string, fileId: string): Promise<void> {
    const cfg = sync.config;
    if (!cfg || this.sending[fileId]) return;
    this.sending = { ...this.sending, [fileId]: true };
    try {
      await coverWork(itemId); // a cover going into the EPUB gets there first
      const item = library.item(itemId);
      const file = item?.files?.find((f) => f.id === fileId);
      const settings = library.settings.kindle;
      if (!item || !file || !settings) return;
      if (settings.workflow < WORKFLOW_VERSION) {
        await putTextFile(cfg, WORKFLOW_PATH, WORKFLOW, 'Update the Send to Kindle workflow', DENIED.workflows);
        await library.saveSettings({ kindle: { ...settings, workflow: WORKFLOW_VERSION } });
      }
      const { defaultBranch } = await checkRepo(cfg);
      const id = await start(cfg, defaultBranch, workflowInputs(file, settings));
      toasts.show(`Sending “${item.title}” to your Kindle…`);
      if (id === undefined) return; // GitHub didn't say which run is sending it
      const run = await finished(cfg, id);
      if (!run) {
        toasts.show(`Still sending “${item.title}”. Look for it on your Kindle in a few minutes.`, 'info', 6000);
      } else if (run.conclusion === 'success') {
        await markSent(itemId, file);
        toasts.show(`Sent “${item.title}” to your Kindle. It shows up there in a few minutes.`, 'info', 6000);
      } else {
        const step = run.conclusion === 'failure' ? await failedStep(cfg, id) : undefined;
        throw new Error(STEP_ERRORS[step ?? ''] ?? FAILED);
      }
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error', 8000);
    } finally {
      const { [fileId]: _, ...rest } = this.sending;
      this.sending = rest;
    }
  }
}

export const kindle = new KindleSender();

/** Starts the workflow, giving GitHub a few seconds to find one that was just put in. */
async function start(cfg: SyncConfig, ref: string, inputs: Record<string, string>): Promise<number | undefined> {
  for (let pause = 2000; ; pause *= 2) {
    try {
      return await dispatchWorkflow(cfg, KINDLE_WORKFLOW, ref, inputs, START_ERRORS);
    } catch (err) {
      if (!(err instanceof GitHubError && err.status === 404) || pause > 8000) throw err;
      await wait(pause);
    }
  }
}

/** The run once it's finished; undefined if it takes more than a few minutes of looking. */
async function finished(cfg: SyncConfig, id: number): Promise<WorkflowRun | undefined> {
  let offline = 0;
  for (let i = 0; i < 75; i++) {
    await wait(4000);
    try {
      const run = await workflowRun(cfg, id);
      if (run.status === 'completed') return run;
      offline = 0;
    } catch (err) {
      // A dropped connection: keep looking for a while.
      if (err instanceof GitHubError || ++offline > 5) throw err;
    }
  }
  return undefined;
}

async function markSent(itemId: string, sent: StoredFile): Promise<void> {
  const item = library.item(itemId);
  if (!item) return;
  const at = nowIso();
  // Only if it's still the same file (not replaced by a newer version meanwhile).
  const files = (item.files ?? []).map((f) => (f.id === sent.id && f.path === sent.path ? { ...f, kindleAt: at } : f));
  await library.saveItem({ ...item, files });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
