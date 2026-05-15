export type ToastType = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
};

type Listener = (items: ToastItem[]) => void;

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 8000,
  warning: 6000,
  info: 4000,
};

let _items: ToastItem[] = [];
let _listeners: Listener[] = [];
let _nextId = 0;

function notify() {
  const snapshot = [..._items];
  _listeners.forEach((fn) => fn(snapshot));
}

function add(type: ToastType, message: string) {
  const id = _nextId++;
  _items = [..._items, { id, type, message }];
  notify();
  setTimeout(() => remove(id), DURATIONS[type]);
}

function remove(id: number) {
  _items = _items.filter((i) => i.id !== id);
  notify();
}

export const toast = {
  success: (msg: string) => add("success", msg),
  error: (msg: string) => add("error", msg),
  warning: (msg: string) => add("warning", msg),
  info: (msg: string) => add("info", msg),
  dismiss: (id: number) => remove(id),
};

export function subscribeToasts(listener: Listener): () => void {
  _listeners.push(listener);
  listener([..._items]);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
