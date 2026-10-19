// Minimal GitHub REST client for the data repo: library.json, files, and the Send to Kindle workflow.

export interface SyncConfig {
  owner: string;
  repo: string;
  token: string;
}

export const DATA_PATH = 'library.json';

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request(cfg: SyncConfig, path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: accept,
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

/** Throws the error for a failed request; `messages` replaces the usual ones by status. */
async function fail(res: Response, context: string, messages: Record<number, string> = {}): Promise<never> {
  let detail = '';
  try {
    detail = (await res.json()).message ?? '';
  } catch {
    /* ignore */
  }
  messages = {
    401: 'GitHub rejected the token. It may be wrong or expired — create a new one and paste it in Settings.',
    403: 'The token is not allowed to do this. Check it has "Contents: Read and write" for the data repo.',
    404: 'Repository not found. Check the owner and repo name, and that the token includes this repo.',
    ...messages,
  };
  throw new GitHubError(messages[res.status] ?? `${context} failed (${res.status}) ${detail}`.trim(), res.status);
}

export interface RepoInfo {
  private: boolean;
  fullName: string;
  defaultBranch: string;
}

export async function checkRepo(cfg: SyncConfig): Promise<RepoInfo> {
  const res = await request(cfg, '');
  if (!res.ok) await fail(res, 'Checking the repository');
  const data = await res.json();
  if (data.permissions && !data.permissions.push) {
    throw new GitHubError('The token can read but not write this repository. Give it "Contents: Read and write".', 403);
  }
  return { private: !!data.private, fullName: data.full_name, defaultBranch: data.default_branch ?? 'main' };
}

export interface RemoteFile {
  text: string;
  sha: string;
}

/** Returns null if the file (or the whole repo) is still empty. */
export async function getFile(cfg: SyncConfig): Promise<RemoteFile | null> {
  const res = await request(cfg, `/contents/${DATA_PATH}`);
  if (res.status === 404) {
    // 404 means either "no file yet" or "no access"; tell them apart.
    await checkRepo(cfg);
    return null;
  }
  if (!res.ok) await fail(res, 'Downloading library');
  const meta = await res.json();
  if (meta.encoding === 'base64' && meta.content) {
    return { text: decodeBase64(meta.content), sha: meta.sha };
  }
  // Files over 1 MB come without inline content; fetch the raw bytes.
  const raw = await request(cfg, `/contents/${DATA_PATH}`, {}, 'application/vnd.github.raw+json');
  if (!raw.ok) await fail(raw, 'Downloading library');
  return { text: await raw.text(), sha: meta.sha };
}

/** Writes the file; returns the new sha. Throws GitHubError 409 on a conflicting write. */
export async function putFile(cfg: SyncConfig, text: string, sha: string | undefined, message: string) {
  const res = await request(cfg, `/contents/${DATA_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encodeBase64(text), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || (res.status === 422 && !sha)) {
    throw new GitHubError('The library changed on another device while saving.', 409);
  }
  if (!res.ok) await fail(res, 'Uploading library');
  const data = await res.json();
  return data.content.sha as string;
}

/** Downloads any file in the data repo as a Blob; null if it doesn't exist. */
export async function getBlob(cfg: SyncConfig, path: string, what = 'a cover'): Promise<Blob | null> {
  const res = await request(cfg, `/contents/${encodePath(path)}`, {}, 'application/vnd.github.raw+json');
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, `Downloading ${what}`);
  return res.blob();
}

/** Creates a new file from raw bytes (base64). */
export async function putBlob(cfg: SyncConfig, path: string, blob: Blob, message: string, what = 'a cover'): Promise<void> {
  const res = await request(cfg, `/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) }),
  });
  // 422 = the file already exists (uploaded earlier from this or another device).
  if (!res.ok && res.status !== 422) await fail(res, `Uploading ${what}`);
}

export async function deletePath(cfg: SyncConfig, path: string, message: string, what = 'a cover'): Promise<void> {
  // Only the sha is needed: ask for the object without its (possibly large) content.
  const meta = await request(cfg, `/contents/${encodePath(path)}`, {}, 'application/vnd.github.object+json');
  if (meta.status === 404) return;
  if (!meta.ok) await fail(meta, `Deleting ${what}`);
  const { sha } = await meta.json();
  const res = await request(cfg, `/contents/${encodePath(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha }) });
  if (!res.ok && res.status !== 404) await fail(res, `Deleting ${what}`);
}

/**
 * Creates or updates a small text file (left alone when it's already the same).
 * `denied` is the message when the token may not write it.
 */
export async function putTextFile(cfg: SyncConfig, path: string, text: string, message: string, denied: string): Promise<void> {
  const meta = await request(cfg, `/contents/${encodePath(path)}`, {}, 'application/vnd.github.object+json');
  let sha: string | undefined;
  if (meta.ok) {
    const data = await meta.json();
    if (data.encoding === 'base64' && decodeBase64(data.content ?? '') === text) return;
    sha = data.sha;
  } else if (meta.status !== 404) {
    await fail(meta, `Reading ${path}`);
  }
  const res = await request(cfg, `/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encodeBase64(text), ...(sha ? { sha } : {}) }),
  });
  // Without the permission for it, GitHub answers 404 rather than 403 for some files.
  if (!res.ok) await fail(res, `Saving ${path}`, { 403: denied, 404: denied });
}

/**
 * Stores a secret for the repository's workflows. It's encrypted here with the repository's
 * key, so only GitHub can read it; it can't be read back.
 */
export async function putSecret(cfg: SyncConfig, name: string, value: string, denied: string): Promise<void> {
  const key = await request(cfg, '/actions/secrets/public-key');
  if (!key.ok) await fail(key, 'Getting the repository’s key', { 403: denied, 404: denied });
  const { key: publicKey, key_id } = await key.json();
  const { sealSecret } = await import('./sealedBox');
  const res = await request(cfg, `/actions/secrets/${name}`, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value: sealSecret(value, publicKey), key_id }),
  });
  if (!res.ok) await fail(res, 'Saving the secret', { 403: denied, 404: denied });
}

export async function deleteSecret(cfg: SyncConfig, name: string): Promise<void> {
  const res = await request(cfg, `/actions/secrets/${name}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) await fail(res, 'Removing the secret');
}

/** Whether the token can see the workflow (needs "Actions" permission); false when GitHub doesn't know it (yet). */
export async function hasWorkflow(cfg: SyncConfig, workflow: string, denied: string): Promise<boolean> {
  const res = await request(cfg, `/actions/workflows/${encodeURIComponent(workflow)}`);
  if (res.status === 404) return false;
  if (!res.ok) await fail(res, 'Checking the workflow', { 403: denied });
  return true;
}

/** Starts a workflow; returns its run's id (when GitHub says it). */
export async function dispatchWorkflow(
  cfg: SyncConfig,
  workflow: string,
  ref: string,
  inputs: Record<string, string>,
  messages: Record<number, string>,
): Promise<number | undefined> {
  const res = await request(cfg, `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref, inputs, return_run_details: true }),
  });
  if (!res.ok) await fail(res, 'Starting the workflow', messages);
  if (res.status === 204) return undefined;
  const data = await res.json().catch(() => ({}));
  return typeof data.workflow_run_id === 'number' ? data.workflow_run_id : undefined;
}

export interface WorkflowRun {
  status: string; // queued, in_progress, completed, …
  conclusion: string | null; // success, failure, cancelled, …
  url: string; // the run's page on GitHub
}

export async function workflowRun(cfg: SyncConfig, id: number): Promise<WorkflowRun> {
  const res = await request(cfg, `/actions/runs/${id}`);
  if (!res.ok) await fail(res, 'Checking the workflow');
  const data = await res.json();
  return { status: data.status, conclusion: data.conclusion ?? null, url: data.html_url };
}

/** The name of the step a finished run failed at. */
export async function failedStep(cfg: SyncConfig, id: number): Promise<string | undefined> {
  const res = await request(cfg, `/actions/runs/${id}/jobs`);
  if (!res.ok) return undefined;
  const data = await res.json();
  for (const job of data.jobs ?? []) {
    for (const step of job.steps ?? []) if (step.conclusion === 'failure') return step.name;
  }
  return undefined;
}

/** Each path segment URL-encoded (file names may contain spaces or Japanese). */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function encodeBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
