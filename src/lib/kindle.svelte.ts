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
import type { Item, KindleSettings, StoredFile } from './types';
import { formatDate, nowIso, toDateString } from './util';

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

/** Where an item's files stand with the Kindle. */
export interface KindleStatus {
  /** One of them is on its way now. */
  sending: boolean;
  /** The newest one that isn't on the Kindle: the one to send next. */
  next?: StoredFile;
  /** When the latest of those on the Kindle went there (not known for ones marked by hand). */
  at?: string;
  /** When an older version of `next` went to the Kindle. */
  older?: string;
}

/** Undefined when none of the item's files can go to a Kindle. `sendingNow`: sends started on this device. */
export function kindleStatus(item: Item, sendingNow: Record<string, true> = {}): KindleStatus | undefined {
  const files = (item.files ?? []).filter(canSendToKindle);
  if (!files.length) return undefined;
  const next = files.filter((f) => !f.kindleAt).sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
  const sent = files.filter((f) => f.kindleAt && !f.kindleByHand).map((f) => f.kindleAt!);
  return {
    sending: files.some((f) => !!f.kindleSend || !!sendingNow[f.id]),
    next,
    at: sent.sort().at(-1),
    older: next?.kindleOlder,
  };
}

/** "Oct 19, 2026" for a time something went to the Kindle. */
export const sentDate = (iso: string): string => formatDate(toDateString(new Date(iso)));

/** The Send to Kindle button: sends, once it's set up, and after asking when the file is there already. */
export function sendToKindle(item: Item, file: StoredFile): void {
  if (!library.settings.kindle) {
    toasts.show('Set up Send to Kindle first. It takes a few minutes, once.');
    location.hash = '/settings?show=kindle';
    return;
  }
  if (file.kindleAt) {
    const when = file.kindleByHand ? 'you marked it as there' : `sent ${sentDate(file.kindleAt)}`;
    if (!confirm(`“${item.title}” is already on your Kindle (${when}). Send it again?`)) return;
  }
  void kindle.send(item.id, file.id);
}

/** Marks a file as on the Kindle, or not, by hand (for files sent some other way). */
export function setOnKindle(itemId: string, fileId: string, on: boolean): Promise<void> {
  return updateFile(itemId, fileId, () =>
    on ? { kindleAt: nowIso(), kindleByHand: true, kindleOlder: undefined } : { kindleAt: undefined, kindleByHand: undefined },
  );
}

/** A run that ended without sending the file. */
class SendFailed extends Error {}

class KindleSender {
  /** Files this device is sending or checking on, by id. */
  sending = $state<Record<string, true>>({});

  /** Sends one of the item's files to the Kindle, and says how it went. */
  async send(itemId: string, fileId: string): Promise<void> {
    const cfg = sync.config;
    if (!cfg || this.sending[fileId]) return;
    this.#busy(fileId, true);
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
      const run = await start(cfg, defaultBranch, workflowInputs(file, settings));
      toasts.show(`Sending “${item.title}” to your Kindle…`);
      if (run === undefined) return; // GitHub didn't say which run is sending it
      // Kept with the file, so how it ends is found out even if the app is closed meanwhile.
      const pending = { run, path: file.path };
      await updateFile(itemId, fileId, () => ({ kindleSend: pending }));
      await this.#follow(cfg, itemId, fileId, pending);
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : String(err), 'error', 8000);
    } finally {
      this.#busy(fileId, false);
    }
  }

  /** Finds out how sends still on their way ended (started before the app was closed, or on another device). */
  resume(): void {
    const cfg = sync.config;
    if (!cfg || !navigator.onLine) return;
    for (const item of library.items) {
      for (const f of item.files ?? []) {
        const pending = f.kindleSend;
        if (!pending || this.sending[f.id]) continue;
        this.#busy(f.id, true);
        this.#follow(cfg, item.id, f.id, pending)
          .catch(async (err) => {
            if (err instanceof SendFailed) toasts.show(err.message, 'error', 8000);
            // GitHub has no such run (any more): nothing to wait for.
            else if (err instanceof GitHubError && err.status === 404) await updateFile(item.id, f.id, () => ({ kindleSend: undefined }));
          })
          .finally(() => this.#busy(f.id, false));
      }
    }
  }

  /** Waits for the run to end, then keeps the outcome with the file. */
  async #follow(cfg: SyncConfig, itemId: string, fileId: string, pending: { run: number; path: string }): Promise<void> {
    const title = () => library.item(itemId)?.title ?? 'the file';
    const run = await finished(cfg, pending.run);
    if (!run) {
      toasts.show(`Still sending “${title()}”. Look for it on your Kindle in a few minutes.`, 'info', 6000);
      return; // checked again next time the app opens
    }
    const sent = run.conclusion === 'success';
    await updateFile(itemId, fileId, (f) =>
      f.kindleSend?.run !== pending.run
        ? {}
        : {
            kindleSend: undefined,
            // Only if it's still the same file (not replaced by a newer version meanwhile).
            ...(sent && f.path === pending.path ? { kindleAt: nowIso(), kindleByHand: undefined, kindleOlder: undefined } : {}),
          },
    );
    if (sent) {
      toasts.show(`Sent “${title()}” to your Kindle. It shows up there in a few minutes.`, 'info', 6000);
      return;
    }
    const step = run.conclusion === 'failure' ? await failedStep(cfg, pending.run) : undefined;
    throw new SendFailed(`“${title()}” wasn’t sent. ${STEP_ERRORS[step ?? ''] ?? FAILED}`);
  }

  #busy(fileId: string, on: boolean) {
    const { [fileId]: _, ...rest } = this.sending;
    this.sending = on ? { ...rest, [fileId]: true } : rest;
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

/** Changes one of an item's files (and saves it, when anything changed). */
async function updateFile(itemId: string, fileId: string, patch: (f: StoredFile) => Partial<StoredFile>): Promise<void> {
  const item = library.item(itemId);
  const file = item?.files?.find((f) => f.id === fileId);
  if (!item || !file) return;
  const changes = Object.entries(patch(file)).filter(([k, v]) => file[k as keyof StoredFile] !== v);
  if (!changes.length) return;
  const next = { ...file, ...Object.fromEntries(changes) } as StoredFile;
  for (const [k, v] of changes) if (v === undefined) delete next[k as keyof StoredFile];
  await library.saveItem({ ...item, files: item.files!.map((f) => (f.id === fileId ? next : f)) });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
