import { blake2b } from '@noble/hashes/blake2.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchWorkflow, failedStep, putSecret, putTextFile, workflowRun } from '../src/lib/github';
import {
  canSendToKindle,
  cleanPassword,
  isEmail,
  mailServer,
  STEP_ERRORS,
  WORKFLOW_VERSION,
  workflowInputs,
} from '../src/lib/kindle.svelte';
import { sealedBox, sealSecret } from '../src/lib/sealedBox';
import type { KindleSettings, StoredFile } from '../src/lib/types';

const cfg = { owner: 'me', repo: 'reading-data', token: 't' };
const workflow = readFileSync(new URL('../src/lib/sendToKindle.yml', import.meta.url), 'utf8');

const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
// Made with libsodium: crypto_box_seed_keypair from seeds of 7s (recipient) and 9s (ephemeral);
// its crypto_box_seal_open opens SEALED.
const RECIPIENT = {
  publicKey: b64('dh2I7IMEE5Gd/p1NHVbxfmU8jJlAgt9bE3uQoK5u33Q='),
  secretKey: b64('L605/v1/o+IAqcYm7vWZ5hotBVxIqCiKTn5MS8o5KPg='),
};
const EPHEMERAL = {
  publicKey: b64('7eI5P+Le/Q/3A3mYQcaZsD/WNKm5xBHtdg33vOXVwmc='),
  secretKey: b64('Po/jqzDAqr9UrNJ289i7vCt8pKlJXSBPJVus9XjHTIY='),
};
const SEALED = '7eI5P+Le/Q/3A3mYQcaZsD/WNKm5xBHtdg33vOXVwmd9Owmgu4xdQmZ9irQnz/FxMFrLJ/SuGHiACwWN';

/** libsodium's crypto_box_seal_open, as GitHub does it. */
function openSealed(sealed: Uint8Array, secretKey: Uint8Array): string | null {
  const epk = sealed.subarray(0, 32);
  const nonce = blake2b(new Uint8Array([...epk, ...RECIPIENT.publicKey]), { dkLen: 24 });
  const opened = nacl.box.open(sealed.subarray(32), nonce, epk, secretKey);
  return opened && new TextDecoder().decode(opened);
}

afterEach(() => vi.unstubAllGlobals());

describe('sealed box (GitHub secrets)', () => {
  it('matches libsodium', () => {
    const out = sealedBox(new TextEncoder().encode('app password'), RECIPIENT.publicKey, EPHEMERAL);
    expect(Buffer.from(out).toString('base64')).toBe(SEALED);
  });

  it('seals a secret only the repository can open', () => {
    const sealed = b64(sealSecret('abcd efgh ijkl mnop', Buffer.from(RECIPIENT.publicKey).toString('base64')));
    expect(sealed.length).toBe(32 + 16 + 19);
    expect(openSealed(sealed, RECIPIENT.secretKey)).toBe('abcd efgh ijkl mnop');
    expect(openSealed(sealed, nacl.box.keyPair().secretKey)).toBeNull();
  });
});

describe('Send to Kindle', () => {
  it('knows the mail servers of common email services', () => {
    expect(mailServer('Me@Gmail.com ')).toBe('smtp.gmail.com:465');
    expect(mailServer('me@icloud.com')).toBe('smtp.mail.me.com:587');
    expect(mailServer('me@me.com')).toBe('smtp.mail.me.com:587');
    expect(mailServer('me@yahoo.co.jp')).toBe('smtp.mail.yahoo.com:465');
    expect(mailServer('me@example.org')).toBeUndefined();
    expect(mailServer('me')).toBeUndefined();
    expect(isEmail('name_abc@kindle.com')).toBe(true);
    expect(isEmail('name@kindle')).toBe(false);
  });

  it('takes app passwords as they’re typed', () => {
    expect(cleanPassword('abcd efgh ijkl mnop ', 'smtp.gmail.com:465')).toBe('abcdefghijklmnop');
    expect(cleanPassword(' abcd-efgh-ijkl-mnop ', 'smtp.mail.me.com:587')).toBe('abcd-efgh-ijkl-mnop');
  });

  it('offers the file types Amazon takes by email', () => {
    const f = (name: string) => ({ name }) as StoredFile;
    expect(canSendToKindle(f('Open_Season.epub'))).toBe(true);
    expect(canSendToKindle(f('scan.PDF'))).toBe(true);
    expect(canSendToKindle(f('notes.txt'))).toBe(true);
    expect(canSendToKindle(f('book.mobi'))).toBe(false);
    expect(canSendToKindle(f('book.azw3'))).toBe(false);
    expect(canSendToKindle(f('manga.cbz'))).toBe(false);
  });

  it('gives the workflow what it asks for, and explains each step that can fail', () => {
    const declared = [...workflow.matchAll(/^ {6}(\w+):\n {8}description:/gm)].map((m) => m[1]);
    const settings: KindleSettings = { to: 'k@kindle.com', from: 'me@gmail.com', server: 'smtp.gmail.com:465', workflow: 1 };
    const inputs = workflowInputs({ path: 'files/i1/x.epub', name: 'x.epub' } as StoredFile, settings);
    expect(declared).toEqual(Object.keys(inputs));
    expect(inputs).toEqual({ path: 'files/i1/x.epub', name: 'x.epub', to: 'k@kindle.com', from: 'me@gmail.com', server: 'smtp.gmail.com:465' });
    const steps = [...workflow.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
    expect(steps).toEqual(Object.keys(STEP_ERRORS));
    // Inputs reach the scripts only through the environment, never pasted into them.
    for (const run of workflow.split(/^ {8}run: \|$/m).slice(1)) expect(run.split(/^ {6}- name:/m)[0]).not.toContain('${{');
  });

  it('has a new version number for every change to the workflow', () => {
    // After changing sendToKindle.yml: raise WORKFLOW_VERSION (so repositories set up before get
    // the new workflow on their next send) and add the file's new hash here.
    const HASHES: Record<number, string> = { 1: 'b32387c73c7ff898a1e5649cbd246e7e780fc996830a4a1b9a7e0276463896f8' };
    expect(createHash('sha256').update(workflow).digest('hex')).toBe(HASHES[WORKFLOW_VERSION]);
  });
});

describe('GitHub calls for the workflow', () => {
  type Call = { url: string; method: string; body?: Record<string, unknown> };
  function github(answer: (c: Call) => Response) {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const c = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined };
      calls.push(c);
      return answer(c);
    }));
    return calls;
  }

  it('writes the workflow file only when it’s new or changed', async () => {
    let stored: string | undefined;
    const calls = github((c) => {
      if (c.method === 'PUT') {
        stored = Buffer.from(c.body!.content as string, 'base64').toString();
        return new Response('{}', { status: 201 });
      }
      if (!stored) return new Response('{"message":"Not Found"}', { status: 404 });
      return Response.json({ sha: 's1', encoding: 'base64', content: Buffer.from(stored).toString('base64') });
    });
    await putTextFile(cfg, '.github/workflows/w.yml', 'one', 'Add', 'denied');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(calls[1].url).toBe('https://api.github.com/repos/me/reading-data/contents/.github/workflows/w.yml');
    expect(calls[1].body!.sha).toBeUndefined();
    await putTextFile(cfg, '.github/workflows/w.yml', 'one', 'Add', 'denied');
    expect(calls.length).toBe(3); // the same: left alone
    await putTextFile(cfg, '.github/workflows/w.yml', 'two', 'Update', 'denied');
    expect(calls[4].body).toMatchObject({ sha: 's1', message: 'Update' });
    expect(stored).toBe('two');
  });

  it('says which permission is missing when GitHub refuses', async () => {
    github((c) => (c.method === 'PUT' ? new Response('{}', { status: 404 }) : new Response('{}', { status: 404 })));
    await expect(putTextFile(cfg, '.github/workflows/w.yml', 'x', 'Add', 'Needs Workflows')).rejects.toThrow('Needs Workflows');
    github(() => new Response('{"message":"Resource not accessible by personal access token"}', { status: 403 }));
    await expect(putSecret(cfg, 'S', 'pw', 'Needs Secrets')).rejects.toThrow('Needs Secrets');
    await expect(dispatchWorkflow(cfg, 'w.yml', 'main', {}, { 403: 'Needs Actions' })).rejects.toThrow('Needs Actions');
  });

  it('stores the password sealed with the repository’s key', async () => {
    const calls = github((c) =>
      c.method === 'GET'
        ? Response.json({ key_id: 'k1', key: Buffer.from(RECIPIENT.publicKey).toString('base64') })
        : new Response(null, { status: 201 }),
    );
    await putSecret(cfg, 'KINDLE_EMAIL_PASSWORD', 'abcdefghijklmnop', 'denied');
    expect(calls[0].url).toBe('https://api.github.com/repos/me/reading-data/actions/secrets/public-key');
    expect(calls[1].url).toBe('https://api.github.com/repos/me/reading-data/actions/secrets/KINDLE_EMAIL_PASSWORD');
    expect(calls[1].body!.key_id).toBe('k1');
    expect(openSealed(b64(calls[1].body!.encrypted_value as string), RECIPIENT.secretKey)).toBe('abcdefghijklmnop');
    expect(JSON.stringify(calls)).not.toContain('abcdefghijklmnop');
  });

  it('starts the workflow and follows its run', async () => {
    const calls = github((c) => {
      if (c.url.endsWith('/dispatches')) return Response.json({ workflow_run_id: 42, run_url: '', html_url: '' });
      if (c.url.endsWith('/runs/42')) return Response.json({ status: 'completed', conclusion: 'failure', html_url: 'https://github.com/r/42' });
      return Response.json({
        jobs: [{ steps: [{ name: 'Set up job', conclusion: 'success' }, { name: 'Sign in to the email account', conclusion: 'failure' }, { name: 'Send the email', conclusion: 'skipped' }] }],
      });
    });
    const id = await dispatchWorkflow(cfg, 'send-to-kindle.yml', 'main', { path: 'files/a.epub' }, {});
    expect(id).toBe(42);
    expect(calls[0].url).toBe('https://api.github.com/repos/me/reading-data/actions/workflows/send-to-kindle.yml/dispatches');
    expect(calls[0].body).toEqual({ ref: 'main', inputs: { path: 'files/a.epub' }, return_run_details: true });
    expect(await workflowRun(cfg, 42)).toEqual({ status: 'completed', conclusion: 'failure', url: 'https://github.com/r/42' });
    expect(await failedStep(cfg, 42)).toBe('Sign in to the email account');
    expect(calls[2].url).toBe('https://api.github.com/repos/me/reading-data/actions/runs/42/jobs');

    github(() => new Response(null, { status: 204 }));
    expect(await dispatchWorkflow(cfg, 'send-to-kindle.yml', 'main', {}, {})).toBeUndefined();
  });
});
