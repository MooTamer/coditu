"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Toasts.
 *
 * The region is `aria-live="polite"` and always present in the DOM — a live
 * region that is inserted at the same moment as its message is frequently not
 * announced at all, because the screen reader never saw it become populated.
 */
interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);

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
            className="pointer-events-auto max-w-[min(92vw,480px)] rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] px-4 py-3 text-[13.5px] leading-[1.5]"
            style={{ boxShadow: "var(--shadow-overlay)", color: "var(--tone-amber-fg)" }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
