"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * True once the client has taken over.
 *
 * The canonical replacement for `const [mounted, setMounted] = useState(false)`
 * plus an effect. Same result, but the value comes from the store API rather
 * than a state update, so it does not schedule a second render pass — and it
 * does not trip `react-hooks/set-state-in-effect`, which flags that pattern for
 * exactly that reason.
 */
const NEVER_CHANGES = () => () => {};
const CLIENT = () => true;
const SERVER = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, CLIENT, SERVER);
}

/**
 * A boolean UI preference persisted in `localStorage`.
 *
 * `localStorage` is an external store, so it is read through the store API:
 * correct on the first client render, no cascading update, and it stays in sync
 * across tabs for free. The browser only fires `storage` for *other* tabs, so
 * writes dispatch a same-tab event too — without that, two components reading
 * the same key would disagree until something else re-rendered them.
 */
const SAME_TAB_EVENT = "coditu:local-storage";

export function usePersistentFlag(key: string, fallback = false) {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(SAME_TAB_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(SAME_TAB_EVENT, onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : stored === "1";
    } catch {
      // Private mode, or storage disabled. The preference is not important
      // enough to break the page over.
      return fallback;
    }
  }, [key, fallback]);

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* see above */
      }
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    },
    [key]
  );

  return [value, setValue] as const;
}
