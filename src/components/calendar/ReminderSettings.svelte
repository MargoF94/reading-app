<script lang="ts">
  import { exportByDefault, setExportByDefault } from '../../lib/calendarExport';
  import { toasts } from '../../lib/toast.svelte';

  // Reading reminders: notification permission (per device) and the phone-calendar default.
  const supported = typeof Notification !== 'undefined';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

  let permission = $state<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported');
  let exportIt = $state(exportByDefault());

  async function allow() {
    if (!supported) return;
    permission = await Notification.requestPermission();
    if (permission === 'granted') toasts.show('Notifications are on for this device.');
  }

  async function test() {
    const options: NotificationOptions = { body: 'This is how a reading reminder looks.', tag: 'test', icon: 'icon-192.png' };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification('Reading time in 10 min', options);
      else new Notification('Reading time in 10 min', options);
    } catch {
      toasts.show('This browser couldn’t show a notification.', 'error');
    }
  }
</script>

<section class="card stack">
  <h2>Reading reminders</h2>
  <p class="small" style="margin:0">
    For reminders that always arrive — even when this app is closed — add reading times to your phone’s calendar when
    you schedule them. The app also reminds you itself while it’s open or was used recently.
  </p>

  <label class="check">
    <input type="checkbox" bind:checked={exportIt} onchange={() => setExportByDefault(exportIt)} />
    <span>Offer to add new reading times to my phone’s calendar</span>
  </label>

  <div class="stack notif">
    <strong class="small">Notifications from this app on this device</strong>
    {#if permission === 'granted'}
      <p class="small ok" style="margin:0">On.</p>
      <div><button type="button" class="btn small" onclick={test}>Send a test notification</button></div>
    {:else if permission === 'denied'}
      <p class="small muted" style="margin:0">Blocked. Allow notifications for this site in your browser’s settings to turn them on.</p>
    {:else if permission === 'unsupported' || (ios && !standalone)}
      <p class="small muted" style="margin:0">
        {#if ios}
          On iPhone and iPad, notifications work once the app is on your Home Screen: tap Share → Add to Home Screen,
          open it from there and come back here.
        {:else}
          This browser can’t show notifications. The in-app reminder banner still works.
        {/if}
      </p>
    {:else}
      <div><button type="button" class="btn small" onclick={allow}>Allow notifications</button></div>
    {/if}
  </div>
</section>

<style>
  h2 {
    margin: 0;
  }

  .check {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    cursor: pointer;
  }

  .check input {
    margin-top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    flex-shrink: 0;
    accent-color: var(--accent);
  }

  .notif {
    gap: 0.35rem;
  }

  .ok {
    color: var(--ok);
    font-weight: 600;
  }
</style>
