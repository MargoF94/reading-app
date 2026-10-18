// Keeping the app itself up to date. A new version is downloaded in the background and
// used after a reload. Home Screen apps on iPhone come back from the background rather
// than starting again, so the app also looks for a new version whenever it's shown, and
// reloads itself at a quiet moment (not while you read or type).
import { registerSW } from 'virtual:pwa-register';

/** When this version was built (and from which commit). */
export const APP_VERSION = __APP_VERSION__;

const CHECK_EVERY = 5 * 60_000;
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;

/** Not in the middle of something a reload would interrupt. */
const quiet = () =>
  !location.hash.startsWith('#/read/') &&
  !(document.activeElement as HTMLElement | null)?.matches?.('input, textarea, select, [contenteditable="true"]');

export function startUpdates(): void {
  registerSW({
    immediate: true,
    onNeedReload() {
      if (document.visibilityState === 'hidden' || quiet()) {
        location.reload();
        return;
      }
      // Later, once you leave the app (after its own saving on leaving is done).
      const later = () => {
        if (document.visibilityState !== 'hidden') return;
        document.removeEventListener('visibilitychange', later);
        setTimeout(() => location.reload(), 1500);
      };
      document.addEventListener('visibilitychange', later);
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
    },
  });
}

/**
 * Looks for a newer version (at most every few minutes, unless `now`).
 * True when one was found: it downloads, then the app reloads into it.
 */
export async function checkForUpdate(now = false): Promise<boolean> {
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration());
  if (!reg || (!now && Date.now() - lastCheck < CHECK_EVERY)) return false;
  lastCheck = Date.now();
  try {
    await reg.update();
  } catch {
    return false;
  }
  return !!(reg.installing || reg.waiting);
}
