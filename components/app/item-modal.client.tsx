"use client";

import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Mono } from "@/components/coditu/mono";

/**
 * The item detail modal.
 *
 * Everything modal about it — focus trap, `Esc`, scroll lock, focus return, and
 * the capped panel that scrolls its own body — lives in `DialogShell`, which
 * this and the New item dialog share. Two copies of a focus trap is two copies
 * that drift, and the one that drifts is always the one without the specs.
 *
 * All this adds is the route behaviour: closing means going back, because the
 * modal IS a URL.
 */
export function ItemModal({ itemKey, children }: { itemKey: string; children: ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);

  return (
    <DialogShell
      label={`Work item ${itemKey}`}
      onClose={close}
      header={
        <Mono size="key" className="text-[var(--accent)]">
          {itemKey}
        </Mono>
      }
    >
      {children}
    </DialogShell>
  );
}
