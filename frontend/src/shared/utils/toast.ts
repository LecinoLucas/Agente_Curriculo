export type ToastType = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: number;
  type: ToastType;
  message: string;
  key?: string;
};

type Listener = (items: ToastItem[]) => void;
type ToastOptions = {
  key?: string;
  persist?: boolean;
};

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 8000,
  warning: 6000,
  info: 4000,
};

let _items: ToastItem[] = [];
let _listeners: Listener[] = [];
let _nextId = 0;
const _timers = new Map<number, ReturnType<typeof setTimeout>>();

function notify() {
  const snapshot = [..._items];
  _listeners.forEach((fn) => fn(snapshot));
}

function clearTimer(id: number) {
  const timer = _timers.get(id);
  if (timer) {
    clearTimeout(timer);
    _timers.delete(id);
  }
}

function scheduleRemoval(id: number, type: ToastType, persist?: boolean) {
  clearTimer(id);
  if (persist) return;
  const timer = setTimeout(() => remove(id), DURATIONS[type]);
  _timers.set(id, timer);
}

function add(type: ToastType, message: string, options: ToastOptions = {}) {
  const existing = options.key
    ? _items.find((item) => item.key === options.key)
    : undefined;

  if (existing) {
    const hasChanged = existing.type !== type || existing.message !== message;
    _items = _items.map((item) =>
      item.id === existing.id
        ? { ...item, type, message, key: options.key }
        : item,
    );
    scheduleRemoval(existing.id, type, options.persist);
    if (hasChanged) notify();
    return existing.id;
  }

  const id = _nextId++;
  _items = [..._items, { id, type, message, key: options.key }];
  notify();
  scheduleRemoval(id, type, options.persist);
  return id;
}

function remove(id: number) {
  clearTimer(id);
  _items = _items.filter((i) => i.id !== id);
  notify();
}

export const toast = {
  success: (msg: string, options?: ToastOptions) => add("success", msg, options),
  error: (msg: string, options?: ToastOptions) => add("error", msg, options),
  warning: (msg: string, options?: ToastOptions) => add("warning", msg, options),
  info: (msg: string, options?: ToastOptions) => add("info", msg, options),
  loading: (msg: string, options?: Omit<ToastOptions, "persist">) =>
    add("info", msg, { ...options, persist: true }),
  dismiss: (id: number) => remove(id),
  dismissKey: (key: string) => {
    const existing = _items.find((item) => item.key === key);
    if (existing) remove(existing.id);
  },
};

export function subscribeToasts(listener: Listener): () => void {
  _listeners.push(listener);
  listener([..._items]);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}
