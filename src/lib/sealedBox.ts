// libsodium's "sealed box" (crypto_box_seal): how GitHub wants a secret encrypted before it's
// stored. Only the repository can open it; this device can't read it back.
import { blake2b } from '@noble/hashes/blake2.js';
import nacl from 'tweetnacl';

/** Encrypts `message` to `publicKey` (32 bytes). `ephemeral` is only passed by tests. */
export function sealedBox(message: Uint8Array, publicKey: Uint8Array, ephemeral = nacl.box.keyPair()): Uint8Array {
  const nonce = blake2b(join(ephemeral.publicKey, publicKey), { dkLen: nacl.box.nonceLength });
  return join(ephemeral.publicKey, nacl.box(message, nonce, publicKey, ephemeral.secretKey));
}

/** A secret's value, sealed and base64-encoded, as the GitHub API takes it. */
export function sealSecret(value: string, publicKeyBase64: string): string {
  const key = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
  const sealed = sealedBox(new TextEncoder().encode(value), key);
  return btoa(String.fromCharCode(...sealed));
}

function join(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
