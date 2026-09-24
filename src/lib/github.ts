// Minimal GitHub REST client for reading/writing library.json in the data repo.

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

async function fail(res: Response, context: string): Promise<never> {
  let detail = '';
  try {
    detail = (await res.json()).message ?? '';
  } catch {
    /* ignore */
  }
  const messages: Record<number, string> = {
    401: 'GitHub rejected the token. It may be wrong or expired — create a new one and paste it in Settings.',
    403: 'The token is not allowed to do this. Check it has "Contents: Read and write" for the data repo.',
    404: 'Repository not found. Check the owner and repo name, and that the token includes this repo.',
  };
  throw new GitHubError(messages[res.status] ?? `${context} failed (${res.status}) ${detail}`.trim(), res.status);
}

export interface RepoInfo {
  private: boolean;
  fullName: string;
}

export async function checkRepo(cfg: SyncConfig): Promise<RepoInfo> {
  const res = await request(cfg, '');
  if (!res.ok) await fail(res, 'Checking the repository');
  const data = await res.json();
  if (data.permissions && !data.permissions.push) {
    throw new GitHubError('The token can read but not write this repository. Give it "Contents: Read and write".', 403);
  }
  return { private: !!data.private, fullName: data.full_name };
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

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
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
