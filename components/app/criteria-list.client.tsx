"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import {
  addCriterion,
  editCriterion,
  removeCriterion,
  setCriterionDone,
} from "@/lib/actions/work-items";
import { flattenToText, isEmptyDocument } from "@/lib/comments/schema";
import type { ProfileRef } from "@/lib/data/profiles";
import type { Criterion } from "@/lib/data/work-item";
import { cn } from "@/lib/utils";

/**
 * The same editor the thread uses, loaded the same way: only when somebody
 * actually intends to write. Reading a list of criteria must not pay for
 * TipTap, and most people only ever read it.
 */
const CommentEditor = dynamic(
  () => import("./comment-editor.client").then((module) => module.CommentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[74px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    ),
  }
);

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Acceptance criteria, with the gradient progress ring.
 *
 * The ring is `r=15` on a 36-unit box with `stroke-dasharray="94.2"` — that is
 * 2·pi·15 rounded, straight from the bundle. Rotated -90deg so it starts at
 * twelve o'clock rather than three.
 *
 * ── A criterion is a document now ──────────────────────────────────────────
 * It holds what a comment holds: paragraphs, lists, links, code blocks, and
 * pictures pasted straight in. "How will we know this is done" is very often a
 * screenshot with an arrow on it, and before this it had to go in the thread
 * with the criterion saying "see comments".
 *
 * The bodies are rendered ON THE SERVER and handed down as `bodies` — the same
 * arrangement the comment thread uses, and for the same reason: `CommentBody`
 * walks stored JSON and pulls in lowlight, and shipping that to make a
 * checklist render would cost the item route a bundle it does not have.
 *
 * ── Why the row is no longer one big button ────────────────────────────────
 * It used to be: the whole row toggled the tick. That cannot survive a
 * criterion containing a link and a picture — a click on the screenshot would
 * tick the box instead of opening it, and a button containing a button is
 * `nested-interactive`. The tick is its own control now, the body is content,
 * and editing sits at the end of the row.
 */
export function CriteriaList({
  itemId,
  criteria,
  bodies,
  canToggle,
  canEdit,
  people,
}: {
  itemId: string;
  criteria: Criterion[];
  /** Server-rendered documents, keyed by criterion id. Null where a criterion
   *  has only ever been a sentence — `body` is then the whole of it. */
  bodies: Record<string, ReactNode>;
  canToggle: boolean;
  /** Admin or lead. Writing what a criterion SAYS is their call; ticking it
   *  is the assignee's and the reviewer's. */
  canEdit: boolean;
  /** For the mention list inside the editor. */
  people: ProfileRef[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  /** `null` = nothing open, `"new"` = the add form, otherwise a criterion id. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Text of a criterion whose edit has been sent but whose server tree has not
   *  come back yet. Without it the row shows the OLD wording for a beat, which
   *  reads as a failed save. */
  const [pendingText, setPendingText] = useState<Record<string, string>>({});

  const [items, setItems] = useOptimistic(criteria, (state, update: { id: string; isDone: boolean }) =>
    state.map((c) => (c.id === update.id ? { ...c, isDone: update.isDone } : c))
  );

  const done = items.filter((c) => c.isDone).length;
  const total = items.length;
  const ringOffset = total ? (94.2 * (total - done)) / total : 94.2;

  function toggle(criterion: Criterion) {
    if (!canToggle) return;
    startTransition(async () => {
      setItems({ id: criterion.id, isDone: !criterion.isDone });
      const result = await settle(
        () => setCriterionDone({ criterionId: criterion.id, isDone: !criterion.isDone }),
        "That tick did not save — check your connection."
      );
      if (!result.ok) toast(result.error ?? "That tick did not save.");
    });
  }

  function save(doc: unknown, criterionId: string | null) {
    if (isEmptyDocument(doc)) {
      toast("A criterion needs something in it.");
      return;
    }
    const text = flattenToText(doc).replace(/\s*\n+\s*/g, " ").trim();
    setEditing(null);
    if (criterionId) setPendingText((was) => ({ ...was, [criterionId]: text }));

    startTransition(async () => {
      const result = await settle(
        () =>
          criterionId
            ? editCriterion({ criterionId, doc })
            : addCriterion({ itemId, doc }),
        "That criterion did not save — check your connection."
      );
      if (result.ok) {
        router.refresh();
      } else {
        toast(result.error ?? "That criterion did not save.");
        if (criterionId) {
          // Invariant 4: the optimistic text goes away at the same moment the
          // reason for it arrives.
          setPendingText((was) => {
            const next = { ...was };
            delete next[criterionId];
            return next;
          });
        }
      }
    });
  }

  function remove(criterion: Criterion) {
    startTransition(async () => {
      const result = await settle(
        () => removeCriterion({ criterionId: criterion.id }),
        "That criterion did not go — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That criterion did not go.");
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--hairline)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="94.2"
            strokeDashoffset={ringOffset}
            transform="rotate(-90 18 18)"
            style={{ transition: "stroke-dashoffset 320ms var(--ease-entrance)" }}
          />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2B57FF" />
              <stop offset="1" stopColor="#21E2C6" />
            </linearGradient>
          </defs>
        </svg>
        <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
          Acceptance criteria
        </Mono>
        <Mono size="key" className="ml-auto">
          {total ? `${done} / ${total}` : "none yet"}
        </Mono>
      </div>

      {total > 0 ? (
        <ul className="mt-[14px] flex flex-col">
          {items.map((criterion) => (
            <li key={criterion.id} className="border-b border-[var(--hairline)]">
              {editing === criterion.id ? (
                <CriterionForm
                  initialDoc={criterion.bodyJson ?? textDoc(criterion.body)}
                  people={people}
                  onCancel={() => setEditing(null)}
                  onSave={(doc) => save(doc, criterion.id)}
                  onToast={toast}
                />
              ) : (
                <div className="group/criterion flex items-start gap-3 py-[11px]">
                  <button
                    type="button"
                    onClick={() => toggle(criterion)}
                    disabled={!canToggle}
                    role="checkbox"
                    aria-checked={criterion.isDone}
                    aria-label={pendingText[criterion.id] ?? criterion.body}
                    title={canToggle ? undefined : "Only the assignee, reviewer, an admin or a lead can tick this"}
                    // 17px is the mark; the button around it is 24px square, so
                    // the target clears WCAG 2.5.8 without the tick growing.
                    className={cn(
                      "-m-[3px] flex size-6 shrink-0 items-center justify-center rounded-[7px] p-[3px]",
                      canToggle ? "cursor-pointer hover:bg-[var(--canvas)]" : "cursor-default"
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex size-[17px] items-center justify-center rounded-[5px] border-[1.5px] transition-[background-color,border-color] duration-[var(--dur-micro)] ease-[var(--ease-entrance)]"
                      style={{
                        borderColor: criterion.isDone ? "#21E2C6" : "var(--hairline-strong)",
                        background: criterion.isDone ? "#21E2C6" : "transparent",
                      }}
                    >
                      {/* The tick arrives on the `micro` tier — 4px, 200ms, no
                          blur. Keyed on the state so ticking again re-runs it;
                          un-ticking simply removes it, because the tier is for
                          entrances and nothing here should animate on exit. */}
                      {criterion.isDone ? (
                        <Check key="done" data-reveal="micro" size={10} strokeWidth={3.4} color="#07090E" />
                      ) : null}
                    </span>
                  </button>

                  <div
                    className="min-w-0 flex-1 text-[14px] leading-[1.5]"
                    style={{
                      color: criterion.isDone ? "var(--ink-muted)" : "var(--ink)",
                      // Only the TEXT is struck through, never a picture inside
                      // it: `line-through` on a container draws a rule across
                      // every screenshot in it.
                      textDecoration: criterion.isDone && !criterion.bodyJson ? "line-through" : "none",
                    }}
                  >
                    {pendingText[criterion.id] ? (
                      <span className="text-[var(--ink-muted)]">{pendingText[criterion.id]}</span>
                    ) : (
                      (bodies[criterion.id] ?? criterion.body)
                    )}
                  </div>

                  {canEdit ? (
                    // Visible on hover, on keyboard focus, and always on a
                    // touch screen — where there is no hover to reveal them.
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-[var(--dur-micro)] focus-within:opacity-100 group-hover/criterion:opacity-100 [@media(pointer:coarse)]:opacity-100">
                      <RowButton label={`Edit criterion: ${criterion.body}`} onClick={() => setEditing(criterion.id)}>
                        <Pencil size={13} strokeWidth={2} aria-hidden />
                      </RowButton>
                      <RowButton label={`Remove criterion: ${criterion.body}`} onClick={() => remove(criterion)}>
                        <Trash2 size={13} strokeWidth={2} aria-hidden />
                      </RowButton>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-[14px] text-[13.5px] text-[var(--ink-faint)]">No acceptance criteria yet.</p>
      )}

      {canEdit ? (
        editing === "new" ? (
          <div className="mt-3">
            <CriterionForm
              initialDoc={EMPTY_DOC}
              people={people}
              onCancel={() => setEditing(null)}
              onSave={(doc) => save(doc, null)}
              onToast={toast}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Add a criterion
          </button>
        )
      ) : null}
    </div>
  );
}

/** A criterion that predates documents, as one — so editing starts from what it says. */
function textDoc(body: string) {
  return { type: "doc", content: [{ type: "paragraph", content: body ? [{ type: "text", text: body }] : [] }] };
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label.split(":")[0]}
      className="flex size-6 items-center justify-center rounded-chip text-[var(--ink-faint)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
    >
      {children}
    </button>
  );
}

/**
 * One criterion, being written.
 *
 * Cmd+Enter saves and Escape cancels, the same two keys the composer uses —
 * one editor, one set of habits.
 */
function CriterionForm({
  initialDoc,
  people,
  onSave,
  onCancel,
  onToast,
}: {
  initialDoc: unknown;
  people: ProfileRef[];
  onSave: (doc: unknown) => void;
  onCancel: () => void;
  onToast: (message: string) => void;
}) {
  const [doc, setDoc] = useState<unknown>(initialDoc);
  const [empty, setEmpty] = useState(isEmptyDocument(initialDoc));

  return (
    <div className="py-3">
      <CommentEditor
        initialDoc={initialDoc}
        people={people}
        autoFocus
        minHeight={44}
        placeholder="What has to be true — paste a screenshot if it is easier"
        ariaLabel="Acceptance criterion"
        onChange={(next, isEmpty) => {
          setDoc(next);
          setEmpty(isEmpty);
        }}
        onSubmit={() => onSave(doc)}
        onEscape={onCancel}
        onToast={onToast}
      />

      <div className="mt-2 flex items-center gap-2">
        <Mono size="eyebrow" className="mr-auto normal-case tracking-normal text-[var(--ink-faint)]">
          ⌘⏎ to save · esc to cancel
        </Mono>
        <button
          type="button"
          onClick={onCancel}
          className="h-[30px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(doc)}
          disabled={empty}
          className="signal-gradient h-[30px] rounded-control px-4 text-[12.5px] font-semibold text-[#07090E] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
