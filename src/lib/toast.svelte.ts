// Short notifications shown at the bottom of the screen.
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  /** A button in the message, e.g. Undo. */
  action?: ToastAction;
}

class Toasts {
  list = $state<Toast[]>([]);
  #next = 1;

  show(text: string, kind: Toast['kind'] = 'info', ms = 3500, action?: ToastAction) {
    const id = this.#next++;
    this.list = [...this.list, { id, text, kind, action }];
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number) {
    this.list = this.list.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
