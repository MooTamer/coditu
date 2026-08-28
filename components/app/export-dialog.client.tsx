"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Download, X } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { listExportItems, renderExport } from "@/lib/actions/export";
import { useMounted } from "@/lib/hooks/use-client-state";
import { hours } from "@/lib/format";
import { cn } from "@/lib/utils";

const STORE_KEY = "coditu.export.v1";

export interface ExportItemSummary {
  key: string;
  title: string;
  minutesLogged: number;
  isDraft: boolean;
}

type Format = "md" | "csv" | "pdf";

/** Card copy is verbatim from the design bundle. */
const FORMATS: Array<{ id: Format; title: string; body: string }> = [
  {
    id: "md",
    title: "Markdown — for an AI agent",
    body: "Front-matter facts, sprint notes, then every item with criteria, discussion, activity and time entries.",
  },
  {
    id: "csv",
    title: "CSV — detailed",
    body: "One row per item, every column including criteria and time entries. Opens in Sheets or Excel.",
  },
  {
    id: "pdf",
    title: "PDF — for the client",
    body: "A typeset sprint report: summary, burn-up, and each item with its acceptance criteria.",
  },
];

const INCLUDE: Array<{ id: keyof StoredOptions; label: string }> = [
  { id: "criteria", label: "Acceptance criteria" },
  { id: "hours", label: "Hours & time entries" },
  { id: "comments", label: "Comments & activity" },
  { id: "owners", label: "Assignee & reviewer" },
];

interface StoredOptions {
  criteria: boolean;
  hours: boolean;
  comments: boolean;
  owners: boolean;
}

interface Stored {
  excluded: string[];
  options: StoredOptions;
}

const DEFAULTS: Stored = {
  excluded: [],
  options: { criteria: true, hours: true, comments: true, owners: true },
};

/**
 * The three item-selection presets, as data.
 *
 * `select` returns the EXCLUDED keys, because that is what `Stored` holds — a
 * list of exclusions rather than inclusions, so that an item added to the
 * sprint after somebody last opened this dialog arrives selected rather than
 * silently missing from their export.
 */
const SELECTIONS: Array<{
  id: string;
  label: string;
  select: (items: ExportItemSummary[]) => string[];
}> = [
  { id: "all", label: "Select all", select: () => [] },
  { id: "none", label: "Select none", select: (items) => items.map((i) => i.key) },
  {
    id: "drafts",
    label: "Drop drafts",
    select: (items) => items.filter((i) => i.isDraft).map((i) => i.key),
  },
];

/** Order-independent, because `excluded` is a set that happens to be an array. */
function sameSelection(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.filter((k) => typeof k === "string") : [],
      options: { ...DEFAULTS.options, ...(parsed.options ?? {}) },
    };
  } catch {
    // A corrupt selection falls back to everything, which is the safe default:
    // an export missing items is worse than one with too many.
    return DEFAULTS;
  }
}

/**
 * The export dialog.
 *
 * Selection persists under `coditu.export.v1`, so it survives to the report
 * route and to the next session — the team exports the same subset repeatedly,
 * and re-ticking twelve boxes every time is the kind of friction that stops
 * people producing the report at all.
 */
export function ExportDialog({
  slug,
  sprintNumber,
  sprintName,
  clientName,
  onClose,
}: {
  slug: string;
  sprintNumber: number;
  sprintName: string;
  clientName: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ExportItemSummary[] | null>(null);
  const [format, setFormat] = useState<Format>("md");
  const [override, setOverride] = useState<Stored | null>(null);
  const [rendered, setRendered] = useState<{ text: string; filename: string; lines: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const mounted = useMounted();

  // Read during render rather than from an effect. `localStorage` is not
  // available on the server, so this waits for mount — but waiting does not
  // require a state update, and deriving it costs one render instead of two.
  const persisted = useMemo(() => (mounted ? readStored() : DEFAULTS), [mounted]);
  const stored = override ?? persisted;

  const persist = useCallback((next: Stored) => {
    setOverride(next);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* selection just falls back to everything */
    }
  }, []);

  const loaded = items !== null;
  const list = items ?? [];

  const selectedKeys = useMemo(
    // Null until the list arrives — asking for "everything" is the right
    // request while we do not yet know what everything is.
    () => (items === null ? null : items.filter((i) => !stored.excluded.includes(i.key)).map((i) => i.key)),
    [items, stored.excluded]
  );

  // Items are fetched when the dialog opens, not shipped with every page.
  useEffect(() => {
    let cancelled = false;
    void listExportItems({ slug, sprintNumber }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.items) setItems(result.items);
      else {
        setItems([]);
        toast(result.error ?? "Those items could not be listed.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, sprintNumber, toast]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Re-render the preview whenever anything that affects it changes. The
  // preview and the download call the same action, so they cannot disagree.
  // PDF has no text preview, so it simply does not render one — derived here
  // rather than cleared from inside the effect below.
  const preview = format === "pdf" ? null : rendered;

  useEffect(() => {
    // Nothing to preview until the item list has arrived — rendering from a
    // guess would flash an export that is not the one being configured.
    if (format === "pdf" || selectedKeys === null) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await renderExport({
        slug,
        sprintNumber,
        format,
        selectedKeys,
        options: stored.options,
      });
      if (cancelled) return;
      if (result.ok && result.text !== undefined) {
        setRendered({ text: result.text, filename: result.filename!, lines: result.lines! });
      } else {
        setRendered(null);
        toast(result.error ?? "That preview could not be built.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [format, slug, sprintNumber, selectedKeys, stored.options, toast]);

  function download() {
    if (!preview) return;
    const blob = new Blob([preview.text], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = preview.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const included = list.length - stored.excluded.length;

  return (
    <div
      onClick={onClose}
      data-scrim
      style={{ paddingBottom: "max(clamp(12px, 4vh, 48px), env(safe-area-inset-bottom))" }}
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto px-4 pt-[clamp(12px,4vh,48px)]"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Export ${clientName} · ${sprintName}`}
        data-reveal="surface"
        // Capped at the scrim's content box and scrolling its own body, for the
        // same reason the item dialog is: twelve items and a long preview grow
        // this panel past the bottom of a laptop screen, and the download
        // buttons are the part that goes over the edge.
        className="flex max-h-full w-full max-w-[1000px] flex-col overflow-hidden rounded-section border border-[var(--hairline-strong)] bg-[var(--overlay)] outline-none"
        style={{ boxShadow: "var(--shadow-overlay)" }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--raised)] px-5 py-4">
          <span className="text-[15.5px] font-bold tracking-[-0.018em]">
            Export {clientName} · {sprintName}
          </span>
          <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
            {included} of {list.length} items
          </Mono>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-[34px] items-center justify-center rounded-control border border-[var(--hairline)] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          {/* ---- left: format, include, items ---- */}
          <div className="flex min-w-0 flex-col gap-[18px] border-r border-[var(--hairline)] p-5">
            <fieldset>
              <legend>
                <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                  Format
                </Mono>
              </legend>
              <div className="mt-[10px] flex flex-col gap-2">
                {FORMATS.map((option) => {
                  const on = format === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setFormat(option.id);
                        setCopied(false);
                      }}
                      className={cn(
                        "flex items-start gap-3 rounded-inner border px-[14px] py-3 text-left",
                        on ? "border-[var(--hairline-strong)] bg-[var(--canvas)]" : "border-[var(--hairline)]"
                      )}
                    >
                      <span
                        aria-hidden
                        className="mt-[2px] size-[15px] shrink-0 rounded-pill border-[1.5px]"
                        style={{
                          borderColor: on ? "#21E2C6" : "var(--hairline-strong)",
                          background: on ? "linear-gradient(135deg, #2B57FF, #21E2C6)" : "transparent",
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold">{option.title}</span>
                        <span className="mt-[3px] block text-[12.5px] leading-[1.45] text-[var(--ink-muted)]">
                          {option.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend>
                <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                  Include
                </Mono>
              </legend>
              <div className="mt-[10px] flex flex-wrap gap-2">
                {INCLUDE.map((option) => {
                  const on = stored.options[option.id];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() =>
                        persist({
                          ...stored,
                          options: { ...stored.options, [option.id]: !on },
                        })
                      }
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-pill border px-3 text-[13px]",
                        on
                          ? "border-[var(--hairline-strong)] bg-[var(--canvas)] text-[var(--ink)]"
                          : "border-[var(--hairline)] text-[var(--ink-muted)]"
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-[13px] rounded-[4px] border-[1.5px]"
                        style={{
                          borderColor: on ? "#21E2C6" : "var(--hairline-strong)",
                          background: on ? "#21E2C6" : "transparent",
                        }}
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex min-w-0 flex-col gap-[10px]">
              <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
                <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                  Items
                </Mono>
                {/* PF-11. These read as `all` `none` `drop drafts` — three
                    10.5px lowercase words that name no object and show no
                    state, so which of them is currently in force can only be
                    learned by pressing one and watching the list. They are the
                    dialog's selection controls; every one of them is a whole
                    sentence about the item list, and the reader was being given
                    one word of it.

                    Each says what it selects, and carries `aria-pressed` for
                    whether the selection on screen IS that one. None pressed is
                    a real and common state — a hand-picked selection matches no
                    preset — which is why these are toggle buttons and not a
                    radio group. The count beside them is the same number the
                    title bar carries; it is repeated here because this is where
                    the decision is made and the title bar is 300px away. */}
                {SELECTIONS.map((selection) => {
                  const next = selection.select(list);
                  const active = loaded && sameSelection(stored.excluded, next);
                  return (
                    <button
                      key={selection.id}
                      type="button"
                      disabled={!loaded}
                      aria-pressed={active}
                      onClick={() => persist({ ...stored, excluded: next })}
                      className={cn(
                        "rounded-chip border px-2 py-[3px] font-mono text-[10.5px] transition-[background-color,border-color,color] duration-[var(--dur-micro)] disabled:opacity-40",
                        active
                          ? "border-[var(--accent)] bg-[var(--tint)] text-[var(--accent)]"
                          : "border-transparent text-[var(--accent)] hover:border-[var(--hairline-strong)] hover:bg-[var(--canvas)]"
                      )}
                    >
                      {selection.label}
                    </button>
                  );
                })}
                <Mono
                  size="eyebrow"
                  aria-live="polite"
                  className="ml-auto normal-case tracking-normal text-[var(--ink-faint)]"
                >
                  {loaded ? `${included} of ${list.length} selected` : "…"}
                </Mono>
              </div>

              {/* `data-export-items` so a spec can reach an ITEM's checkbox.
                  The Include options above are `role="checkbox"` too, so
                  `getByRole("checkbox").first()` inside this dialog finds
                  "Acceptance criteria" and quietly changes nothing about the
                  selection. */}
              <ul
                data-export-items
                className="max-h-[300px] overflow-y-auto overflow-x-hidden rounded-inner border border-[var(--hairline)]"
              >
                {list.map((item) => {
                  const on = !stored.excluded.includes(item.key);
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() =>
                          persist({
                            ...stored,
                            excluded: on
                              ? [...stored.excluded, item.key]
                              : stored.excluded.filter((key) => key !== item.key),
                          })
                        }
                        className={cn(
                          "flex w-full items-center gap-[11px] border-b border-[var(--hairline)] px-3 py-[10px] text-left last:border-b-0",
                          on ? "bg-transparent" : "bg-[var(--canvas)]"
                        )}
                      >
                        <span
                          aria-hidden
                          className="size-[15px] shrink-0 rounded-[5px] border-[1.5px]"
                          style={{
                            borderColor: on ? "#21E2C6" : "var(--hairline-strong)",
                            background: on ? "#21E2C6" : "transparent",
                          }}
                        />
                        <Mono size="eyebrow" className="shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
                          {item.key}
                        </Mono>
                        <span
                          className="min-w-0 flex-1 truncate text-[13px]"
                          style={{ color: on ? "var(--ink)" : "var(--ink-faint)" }}
                        >
                          {item.title}
                        </span>
                        <Mono size="eyebrow" className="shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
                          {item.minutesLogged > 0 ? `${hours(item.minutesLogged)}h` : "—"}
                        </Mono>
                      </button>
                    </li>
                  );
                })}
                {!loaded ? (
                  <li className="px-3 py-[10px]">
                    <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                      loading items…
                    </Mono>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>

          {/* ---- right: live preview ---- */}
          <div className="flex min-w-0 flex-col gap-[14px] bg-[var(--raised)] p-5">
            <div className="flex items-center gap-[10px]">
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                {format === "csv" ? "CSV preview" : format === "md" ? "Markdown preview" : "Client report"}
              </Mono>
              <Mono size="eyebrow" className="ml-auto normal-case tracking-normal text-[var(--ink-faint)]">
                {format === "pdf" ? "print-ready" : preview ? `${preview.lines} lines` : "…"}
              </Mono>
            </div>

            {format === "pdf" ? (
              <div className="flex flex-col gap-[14px] rounded-inner border border-[var(--hairline)] bg-[var(--overlay)] p-[22px]">
                <div className="flex items-center gap-[10px]">
                  <span
                    aria-hidden
                    className="size-2 rounded-pill"
                    style={{ background: "linear-gradient(135deg, #2B57FF, #21E2C6)" }}
                  />
                  <Mono size="eyebrow" className="tracking-[0.07em] text-[var(--accent)]">
                    Sprint report
                  </Mono>
                </div>
                <div className="text-[19px] font-bold tracking-[-0.022em]">{sprintName}</div>
                <p className="text-[12.5px] leading-[1.55] text-[var(--ink-muted)]">
                  A client-facing document: cover summary, status distribution, burn-up, then every
                  included item with its acceptance criteria as written. No internal comments, no
                  activity log, no keys the client has no use for.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Letter · portrait", "running header + footer", `${included} of ${list.length} items`].map(
                    (chip) => (
                      <Mono
                        key={chip}
                        size="eyebrow"
                        className="rounded-chip border border-[var(--hairline)] px-2 py-1 normal-case tracking-normal text-[var(--ink-faint)]"
                      >
                        {chip}
                      </Mono>
                    )
                  )}
                </div>
                <Link
                  href={`/app/projects/${slug}/sprints/${sprintNumber}/report`}
                  // PF-12. The report replaces this screen, so the dialog was
                  // always going to unmount — but only once the navigation
                  // committed, which on a dynamic route is long enough to read
                  // as "the button did nothing and the modal is stuck". Closing
                  // on activation makes the click say so immediately.
                  //
                  // A modified click is deliberately NOT a close: cmd/ctrl/shift
                  // and the middle button open the report in a new tab, this
                  // screen stays where it was, and closing it would throw away
                  // a selection the reader is still working on.
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0
                    ) {
                      return;
                    }
                    onClose();
                  }}
                  className="signal-gradient mt-1 inline-flex h-[42px] items-center justify-center gap-[10px] rounded-control text-[14px] font-semibold text-[#07090E]"
                >
                  Open report to print
                  <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
                </Link>
                <Mono size="eyebrow" className="normal-case tracking-normal text-[var(--ink-faint)]">
                  your selection travels with it · export to PDF from there
                </Mono>
              </div>
            ) : (
              <>
                {/* The preview scrolls, so it has to be reachable by keyboard —
                    otherwise a keyboard-only reader can see the first screen of
                    the export and no more. `role="region"` with a name is what
                    makes the tab stop mean something when it is announced. */}
                <pre
                  tabIndex={0}
                  role="region"
                  aria-label={`${format === "csv" ? "CSV" : "Markdown"} preview`}
                  aria-busy={pending}
                  className="max-h-[420px] min-h-[280px] flex-1 overflow-auto whitespace-pre rounded-inner border border-[var(--hairline)] bg-[var(--canvas)] p-4 font-mono text-[11px] leading-[1.6] text-[var(--ink)]"
                  style={{ tabSize: 2 }}
                >
                  {preview?.text ?? "building the preview…"}
                </pre>
                <div className="flex gap-[10px]">
                  <button
                    type="button"
                    disabled={!preview}
                    onClick={() => {
                      if (!preview) return;
                      void navigator.clipboard?.writeText(preview.text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                    className="h-[42px] flex-1 rounded-control border border-[var(--hairline-strong)] text-[14px] font-medium hover:bg-[var(--canvas)] disabled:opacity-50"
                  >
                    {copied ? "Copied" : "Copy to clipboard"}
                  </button>
                  <button
                    type="button"
                    disabled={!preview}
                    onClick={download}
                    className="signal-gradient inline-flex h-[42px] flex-1 items-center justify-center gap-2 rounded-control text-[14px] font-semibold text-[#07090E] disabled:opacity-50"
                  >
                    <Download size={14} strokeWidth={2} aria-hidden />
                    Download .{format}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
