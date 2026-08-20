"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { commitImport, previewImport } from "@/lib/actions/import";
import type { ImportPreview } from "@/lib/import/notion";
import { hours } from "@/lib/format";

const HEAD =
  "px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--ink-faint)]";

/**
 * Drop a CSV, read what it would do, then commit.
 *
 * Nothing is written until the commit, and the commit re-derives everything
 * from the same file text — so the preview is a promise the commit keeps rather
 * than a separate guess that might disagree.
 */
export function ImportPanel({
  sprintId,
  sprintName,
  canCommit,
}: {
  sprintId: string | null;
  sprintName: string | null;
  canCommit: boolean;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  function accept(file: File) {
    startTransition(async () => {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);

      const form = new FormData();
      form.append("file", file);
      const result = await previewImport(form);

      if (result.ok && result.preview) setPreview(result.preview);
      else {
        setPreview(null);
        toast(result.error ?? "That file could not be read.");
      }
    });
  }

  function commit() {
    if (!sprintId) return;
    startTransition(async () => {
      const result = await commitImport({ csv, sprintId });
      if (result.ok) {
        toast(
          `Imported ${result.written} row${result.written === 1 ? "" : "s"}` +
            (result.skipped ? `, skipped ${result.skipped} with issues.` : ".")
        );
        setPreview(null);
        setFileName(null);
        setCsv("");
        router.refresh();
      } else {
        toast(result.error ?? "The import did not save.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) accept(file);
        }}
        className="flex flex-wrap items-center gap-4 rounded-list border border-dashed bg-[var(--raised)] p-7"
        style={{ borderColor: dragging ? "var(--accent)" : "var(--hairline-strong)" }}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--accent)]">
          <Upload size={18} strokeWidth={1.8} aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          {preview && fileName ? (
            <>
              <span className="block truncate text-[15px] font-semibold">{fileName}</span>
              <Mono size="meta" className="block text-[11.5px] text-[var(--ink-faint)]">
                {preview.rows.length} rows · {preview.columns.length} columns ·{" "}
                {preview.committable} ready, {preview.skipped} flagged
              </Mono>
            </>
          ) : (
            <>
              <span className="block text-[15px] font-semibold">Drop the Notion CSV export</span>
              <Mono size="meta" className="block text-[11.5px] text-[var(--ink-faint)]">
                nothing is written until you commit
              </Mono>
            </>
          )}
        </span>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) accept(file);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="h-9 shrink-0 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:opacity-60"
        >
          Choose a file
        </button>

        {preview ? (
          <button
            type="button"
            onClick={commit}
            disabled={pending || !canCommit || !sprintId || preview.committable === 0}
            aria-busy={pending}
            title={
              !canCommit
                ? "Only an admin or lead can import work items"
                : !sprintId
                  ? "There is no open sprint to import into"
                  : undefined
            }
            className="signal-gradient h-9 shrink-0 rounded-control px-4 text-[13.5px] font-semibold text-[#07090E] disabled:opacity-50"
          >
            Commit {preview.committable} row{preview.committable === 1 ? "" : "s"}
            {sprintName ? ` to ${sprintName}` : ""}
          </button>
        ) : null}
      </section>

      {preview ? (
        <>
          <section className="overflow-auto rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
            <table className="w-full border-collapse">
              <caption className="sr-only">How each Notion column maps</caption>
              <thead>
                <tr className="border-b border-[var(--hairline-strong)]">
                  <th scope="col" className={`text-left ${HEAD}`}>Notion column</th>
                  <th scope="col" className={`text-left ${HEAD}`}>Maps to</th>
                  <th scope="col" className={`text-left ${HEAD}`}>Sample</th>
                  <th scope="col" className={`text-right ${HEAD}`}>State</th>
                </tr>
              </thead>
              <tbody>
                {preview.mappings.map((mapping) => (
                  <tr key={mapping.from} className="border-b border-[var(--hairline)] last:border-b-0">
                    <td className="px-4 py-3">
                      <Mono size="key" className="text-[12.5px]">{mapping.from}</Mono>
                    </td>
                    <td className="px-4 py-3">
                      <Mono size="key" className="text-[12.5px] text-[var(--accent)]">{mapping.to}</Mono>
                    </td>
                    <td className="px-4 py-3 text-[13.5px] text-[var(--ink-muted)]">{mapping.sample}</td>
                    <td className="px-4 py-3 text-right">
                      <ToneChip tone={mapping.state === "mapped" ? "jade" : mapping.state === "unmatched" ? "amber" : "slate"}>
                        {mapping.state}
                      </ToneChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {preview.skipped > 0 ? (
            <section className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5">
              <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                {preview.skipped} row{preview.skipped === 1 ? "" : "s"} will be skipped
              </Mono>
              <ul className="mt-3 flex flex-col gap-2">
                {preview.rows
                  .filter((row) => row.issues.length > 0)
                  .map((row) => (
                    <li key={row.line} className="flex flex-wrap items-baseline gap-2">
                      <Mono size="meta" className="text-[var(--ink-faint)]">
                        line {row.line}
                      </Mono>
                      <span className="text-[13.5px] font-medium">{row.title || "(no title)"}</span>
                      <span className="text-[13px]" style={{ color: "var(--tone-amber-fg)" }}>
                        {row.issues.map((issue) => issue.message).join(" ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <section className="overflow-auto rounded-list border border-[var(--hairline)] bg-[var(--raised)]">
            <table className="w-full border-collapse">
              <caption className="sr-only">Rows that would be created</caption>
              <thead>
                <tr className="border-b border-[var(--hairline-strong)]">
                  <th scope="col" className={`text-left ${HEAD}`}>Title</th>
                  <th scope="col" className={`text-left ${HEAD}`}>Status</th>
                  <th scope="col" className={`text-left ${HEAD}`}>Assignee</th>
                  <th scope="col" className={`text-left ${HEAD}`}>Deadline</th>
                  <th scope="col" className={`text-right ${HEAD}`}>Hours</th>
                  <th scope="col" className={`text-right ${HEAD}`}>Grouping</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.line}
                    className="border-b border-[var(--hairline)] last:border-b-0"
                    style={{ opacity: row.issues.length ? 0.5 : 1 }}
                  >
                    <td className="px-4 py-3 text-[13.5px]">{row.title || "(no title)"}</td>
                    <td className="px-4 py-3">
                      <Mono size="meta" className="text-[var(--ink-muted)]">{row.status}</Mono>
                    </td>
                    <td className="px-4 py-3 text-[13.5px] text-[var(--ink-muted)]">
                      {row.assigneeName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Mono size="meta" className="text-[var(--ink-muted)]">{row.deadline ?? "—"}</Mono>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Mono size="meta" className="text-[var(--ink-muted)]">
                        {row.minutesWorked ? hours(row.minutesWorked) : "—"}
                      </Mono>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Mono size="meta" className="text-[var(--ink-muted)]">{row.grouping ?? "—"}</Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
