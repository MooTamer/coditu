"use client";

import { Clock, FileText, ListTree, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Mono } from "@/components/coditu/mono";

/**
 * The four things you do from Home, reconciled with the direct source.
 *
 * ## What the source actually draws
 *
 * `homeVals()` in `design/project/Coditu Workspace.dc.html`:
 *
 * ```js
 * { label: "New story",   key: "n", run: … create … },
 * { label: "New note",    key: "",  run: () => this.go("notes") },
 * { label: "Open sprint", key: "s", run: () => this.go("sprint") },
 * { label: "Log time",    key: "t", run: … open an item … },
 * ```
 *
 * Three corrections against what was built:
 *
 * 1. The second action is **New note**, not "Sprint notes".
 * 2. It has **no key**. The build drew and bound `N`, and the gap matrix cited
 *    that as conformance to a source which gives it the empty string. A badge
 *    is only worth drawing if the source draws it, so the badge and its binding
 *    are both gone. Whether Coditu *wants* a shortcut there is a product call
 *    and it is recorded as one in `docs/08-GAP-MATRIX.md`, not settled here by
 *    quietly editing what the authority says.
 * 3. **Log time goes to a story.** It used to link to the sprint table, which
 *    is a list of stories and not a place time can be logged — the control
 *    named an action it did not perform. It now opens the caller's own story in
 *    the active sprint, anchored at the Log time panel, which is the flow that
 *    calls `logTime`. The prototype's own handler opens an item for the same
 *    reason.
 *
 * ## The keys are real, or they are not drawn
 *
 * Each remaining badge is bound. The listener stands down while focus is in a
 * field or a contenteditable — otherwise typing "notes" into search fires two
 * actions — and on any modifier, so `⌘S` and `⌘T` still belong to the browser.
 * It also stands down on an auto-repeating key: holding `s` must navigate once,
 * not once per repeat.
 */
export function HomeQuickActions({
  sprintHref,
  notesHref,
  logTime,
  canCreate,
}: {
  /** The active sprint, or null when no project has one. */
  sprintHref: string | null;
  /** That sprint's notes. Null for the same reason. */
  notesHref: string | null;
  /**
   * The story `Log time` opens, already scoped to the active project and
   * sprint by `logTimeTarget`. Null when the caller has nothing in it — in
   * which case the action is not offered rather than offered and inert.
   */
  logTime: { href: string; itemKey: string } | null;
  /** Admin or lead. RLS refuses an engineer's insert, so the action is not
   *  offered rather than offered and refused. */
  canCreate: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // Holding the key down must not fire the action once per repeat.
      if (event.repeat) return;

      // Never while somebody is typing. `isContentEditable` covers the block
      // editor, which is a div and not a field.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if (event.key === "n" && canCreate) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("coditu:new-item"));
      } else if (event.key === "s" && sprintHref) {
        event.preventDefault();
        router.push(sprintHref);
      } else if (event.key === "t" && logTime) {
        event.preventDefault();
        router.push(logTime.href);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, sprintHref, logTime, canCreate]);

  const shell =
    "inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-[13px] text-[13px] font-medium text-[var(--ink)] hover:border-[var(--hairline-strong)] hover:bg-[var(--overlay)] md:h-[34px]";

  return (
    <div data-home-quick-actions className="flex flex-wrap gap-2">
      {canCreate ? (
        <button
          type="button"
          // The topbar owns the create dialog; this asks it to open rather than
          // growing a second copy of it. One dialog, one piece of state.
          onClick={() => window.dispatchEvent(new CustomEvent("coditu:new-item"))}
          className={`${shell} cursor-pointer`}
        >
          <Plus size={14} strokeWidth={1.9} aria-hidden className="text-[var(--ink-faint)]" />
          New story
          <Mono size="meta" className="text-[var(--ink-faint)]">
            n
          </Mono>
        </button>
      ) : null}

      {notesHref ? (
        <Link href={notesHref} className={shell}>
          <FileText size={14} strokeWidth={1.9} aria-hidden className="text-[var(--ink-faint)]" />
          New note
        </Link>
      ) : null}

      {sprintHref ? (
        <Link href={sprintHref} className={shell}>
          <ListTree size={14} strokeWidth={1.9} aria-hidden className="text-[var(--ink-faint)]" />
          Open sprint
          <Mono size="meta" className="text-[var(--ink-faint)]">
            s
          </Mono>
        </Link>
      ) : null}

      {logTime ? (
        <Link
          href={logTime.href}
          // The label is the design's; the title says which story, because a
          // control that navigates should say where before it is pressed.
          title={`Log time on ${logTime.itemKey}`}
          className={shell}
        >
          <Clock size={14} strokeWidth={1.9} aria-hidden className="text-[var(--ink-faint)]" />
          Log time
          <span className="sr-only"> on {logTime.itemKey}</span>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            t
          </Mono>
        </Link>
      ) : null}
    </div>
  );
}
