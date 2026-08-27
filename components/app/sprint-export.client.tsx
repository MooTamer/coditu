"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { ExportDialog } from "@/components/app/export-dialog.client";

/**
 * Export, where the design puts it.
 *
 * It used to sit in the global topbar, which meant every screen in the app
 * carried a control for a thing only one screen has. On `/app/profile` it was
 * disabled with a tooltip explaining that there was no sprint to export — a
 * sentence nobody needed on a page about their own name.
 *
 * `Coditu Workspace.dc.html` puts it in the sprint header's own action cluster,
 * beside Sprint notes, and that is the only place it appears. Here it is never
 * disabled, because it only renders where there is something to export.
 */
export function SprintExport({
  slug,
  sprintNumber,
  sprintName,
  clientName,
}: {
  slug: string;
  sprintNumber: number;
  sprintName: string;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Export ${clientName} · ${sprintName}`}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-control border border-[var(--hairline)] px-[11px] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--tint)] hover:text-[var(--ink)] md:h-[34px]"
      >
        <Download size={13} strokeWidth={1.9} aria-hidden />
        Export
      </button>

      {open ? (
        <ExportDialog
          slug={slug}
          sprintNumber={sprintNumber}
          sprintName={sprintName}
          clientName={clientName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
