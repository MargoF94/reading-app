// Short notifications shown at the bottom of the screen.
export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

class Toasts {
  list = $state<Toast[]>([]);
  #next = 1;

  show(text: string, kind: Toast['kind'] = 'info', ms = 3500) {
    const id = this.#next++;
    this.list = [...this.list, { id, text, kind }];
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number) {
    this.list = this.list.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
