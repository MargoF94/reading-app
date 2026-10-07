// A reading timer for paper books, audiobooks and anything read outside the app.
// It keeps running while you use the rest of the app (and across reloads, on this
// device); stopping it logs the time on the book.
import { getMeta, setMeta } from './db';
import { library } from './store.svelte';
import { newId, nowIso, today } from './util';

interface TimerState {
  itemId: string;
  startedAt: string; // ISO, when the timer was first started
  date: string; // day it started
  accumulated: number; // ms counted before the current run
  runningSince: number | null; // epoch ms, null while paused
}

const KEY = 'readingTimer';

class Timer {
  state = $state<TimerState | null>(null);
  /** Re-read every second while running, for the display. */
  now = $state(Date.now());
  #interval: ReturnType<typeof setInterval> | undefined;

  async load() {
    this.state = (await getMeta<TimerState>(KEY)) ?? null;
    this.#tick();
  }

  get elapsedMs(): number {
    const s = this.state;
    if (!s) return 0;
    return s.accumulated + (s.runningSince ? Math.max(0, this.now - s.runningSince) : 0);
  }

  get running(): boolean {
    return !!this.state?.runningSince;
  }

  isFor(itemId: string): boolean {
    return this.state?.itemId === itemId;
  }

  async start(itemId: string) {
    if (this.state && this.state.itemId !== itemId) await this.stop();
    if (this.state) return this.resume();
    await this.#set({ itemId, startedAt: nowIso(), date: today(), accumulated: 0, runningSince: Date.now() });
  }

  async pause() {
    const s = this.state;
    if (!s?.runningSince) return;
    await this.#set({ ...s, accumulated: this.elapsedMs, runningSince: null });
  }

  async resume() {
    const s = this.state;
    if (!s || s.runningSince) return;
    await this.#set({ ...s, runningSince: Date.now() });
  }

  /** Logs `minutes` (default: the time counted) on the book and clears the timer. Returns the seconds logged. */
  async stop(minutes?: number): Promise<number> {
    const s = this.state;
    if (!s) return 0;
    const seconds = Math.round(minutes !== undefined ? minutes * 60 : this.elapsedMs / 1000);
    if (seconds >= 60 && library.item(s.itemId)) {
      const now = nowIso();
      await library.saveTime({ id: newId(), createdAt: now, updatedAt: now, itemId: s.itemId, date: s.date, start: s.startedAt, seconds, source: 'timer' });
    }
    await this.#set(null);
    return seconds >= 60 ? seconds : 0;
  }

  async discard() {
    await this.#set(null);
  }

  async #set(s: TimerState | null) {
    this.state = s;
    this.now = Date.now();
    await setMeta(KEY, s);
    this.#tick();
  }

  #tick() {
    clearInterval(this.#interval);
    if (this.state?.runningSince) this.#interval = setInterval(() => (this.now = Date.now()), 1000);
  }
}

export const timer = new Timer();

/** "12:34" or "1:02:05". */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
