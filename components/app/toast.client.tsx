"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Toasts.
 *
 * The region is `aria-live="polite"` and always present in the DOM — a live
 * region that is inserted at the same moment as its message is frequently not
 * announced at all, because the screen reader never saw it become populated.
 *
 * ## Why a toast can carry an action
 *
 * This app's rule for a reversible destructive action is an **undo toast**, not
 * a confirm dialog; a two-step confirm is reserved for the things that are not
 * reversible in the same breath (deactivating a person). Deleting a criterion,
 * a comment, a time entry or a work item are all reversible, so each of them
 * gets the same shape: it happens, and the sentence that says so hands it back.
 *
 * A toast with an action lives longer than one without — ten seconds rather
 * than six — because a person has to read it, decide, and reach the button, and
 * the whole point is lost if it fades while they are still deciding.
 */
interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

type Push = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Push>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const PLAIN_MS = 6000;
const WITH_ACTION_MS = 10_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<Push>(
    (message, action) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, message, action }]);
      setTimeout(() => dismiss(id), action ? WITH_ACTION_MS : PLAIN_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-reveal="surface"
            role="status"
            className="pointer-events-auto flex max-w-[min(92vw,480px)] items-center gap-3 rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] px-4 py-3 text-[13.5px] leading-[1.5]"
            style={{ boxShadow: "var(--shadow-overlay)", color: "var(--tone-amber-fg)" }}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action?.onAction();
                }}
                // 44px on a coarse pointer comes from the global rule; the
                // height here is the desktop one.
                className="-my-1 shrink-0 rounded-control border border-[var(--hairline-strong)] px-3 py-[6px] text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--canvas)]"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
