<script lang="ts">
  import { untrack } from 'svelte';
  import { itemLink } from '../../lib/calendarExport';
  import { router } from '../../lib/router.svelte';
  import { addDays, dueReminders, endTime, occurrences, type Occurrence } from '../../lib/schedule';
  import { library } from '../../lib/store.svelte';
  import { today } from '../../lib/util';
  import Cover from '../Cover.svelte';
  import Icon from '../Icon.svelte';

  // Reading reminders while the app is open (or recently used): a banner here,
  // plus a system notification when the app is in the background and allowed to.
  // Reminders that must arrive while the app is closed go through the phone's
  // calendar instead (see ScheduleDialog).
  const SHOWN_KEY = 'reading-app:reminded';
  const SNOOZE_MS = 10 * 60_000;

  let active = $state<Occurrence[]>([]);
  let shown: Record<string, number> = load(SHOWN_KEY);
  let snoozed: Record<string, number> = {};
  let now = $state(new Date());

  function load(key: string): Record<string, number> {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}');
      const cutoff = Date.now() - 3 * 86_400_000;
      return Object.fromEntries(Object.entries(data).filter(([, t]) => typeof t === 'number' && t > cutoff)) as Record<string, number>;
    } catch {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
    } catch {
      /* storage blocked: reminders may repeat after a reload */
    }
  }

  function heading(o: Occurrence, at: Date): string {
    const mins = Math.round((o.startAt.getTime() - at.getTime()) / 60_000);
    if (mins > 0) return `Reading time in ${mins} min`;
    return mins > -2 ? 'Reading time now' : `Reading time — started at ${o.session.start}`;
  }

  async function notify(o: Occurrence) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // the banner is enough
    const item = library.item(o.session.itemId);
    if (!item) return;
    const title = heading(o, new Date());
    const options: NotificationOptions = {
      body: `${item.title} · ${o.session.start}–${endTime(o.session.start, o.session.minutes)}`,
      tag: o.key,
      icon: 'icon-192.png',
      data: { url: itemLink(item) },
    };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, options);
      else new Notification(title, options);
    } catch {
      /* notifications unavailable here */
    }
  }

  function check() {
    if (!library.loaded) return;
    const t = new Date();
    now = t;
    const d = today();
    const occs = occurrences(library.schedule, addDays(d, -1), addDays(d, 1));
    const byKey = new Map(occs.map((o) => [o.key, o]));
    const next = active.filter((o) => byKey.has(o.key) && o.endAt > t).map((o) => byKey.get(o.key)!);
    for (const [key, until] of Object.entries(snoozed)) {
      if (t.getTime() < until) continue;
      delete snoozed[key];
      const o = byKey.get(key);
      if (o && o.endAt > t && !next.some((x) => x.key === key)) {
        next.push(o);
        void notify(o);
      }
    }
    for (const o of dueReminders(occs, t, new Set(Object.keys(shown)))) {
      shown[o.key] = Date.now();
      next.push(o);
      void notify(o);
    }
    save();
    active = next;
  }

  // Re-check when the library loads or the schedule changes (check itself isn't tracked).
  $effect(() => {
    void library.loaded;
    void library.schedule;
    untrack(check);
  });

  $effect(() => {
    const timer = setInterval(check, 20_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  });

  function close(o: Occurrence) {
    active = active.filter((x) => x.key !== o.key);
  }

  function snooze(o: Occurrence) {
    snoozed[o.key] = Date.now() + SNOOZE_MS;
    close(o);
  }
</script>

{#if active.length}
  <div class="banners" role="status" aria-live="polite">
    {#each active as o (o.key)}
      {@const item = library.item(o.session.itemId)}
      {#if item}
        <div class="banner">
          <span class="ring scheduled"><Cover {item} width={40} /></span>
          <div class="text">
            <span class="small muted">{heading(o, now)}</span>
            <strong>{item.title}</strong>
            <span class="small muted">{o.session.start}–{endTime(o.session.start, o.session.minutes)}</span>
            <div class="row btns">
              <button
                type="button"
                class="btn primary small"
                onclick={() => {
                  close(o);
                  router.go(`/item/${item.id}`);
                }}>Start reading</button
              >
              <button type="button" class="btn small" onclick={() => snooze(o)}>Snooze 10 min</button>
            </div>
          </div>
          <button type="button" class="btn ghost icon small x" aria-label="Dismiss reminder" onclick={() => close(o)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .banners {
    position: sticky;
    top: calc(0.5rem + var(--sat));
    z-index: 15;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .banner {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--ok);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0.7rem 0.6rem 0.7rem 0.8rem;
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    overflow-wrap: anywhere;
  }

  .btns {
    margin-top: 0.4rem;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .x {
    flex-shrink: 0;
  }
</style>
