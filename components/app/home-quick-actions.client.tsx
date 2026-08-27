"use client";

import { Clock, FileText, ListTree, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Mono } from "@/components/coditu/mono";

/**
 * The four things you do from Home, with the keys the handoff gives them.
 *
 * ## The key badges are real, or they are not drawn
 *
 * `Coditu Workspace.dc.html` draws `New story n`, `New note N`, `Open sprint s`
 * and `Log time t`. A badge that names a key nothing listens for is worse than
 * no badge — so each one below is bound, and the two that need a destination
 * are not rendered at all when there is no active sprint to point at.
 *
 * The listener ignores a keystroke while focus is in a field or a
 * contenteditable, which is the whole reason single-letter shortcuts are
 * usually a bad idea: typing "note" into the search box must not open three
 * things. It also ignores anything carrying a modifier, so `⌘N` still belongs
 * to the browser.
 *
 * `N` and `n` are different actions, which is the handoff's own choice — shift
 * is part of the binding, not a modifier to strip.
 */
export function HomeQuickActions({
  sprintHref,
  notesHref,
  canCreate,
}: {
  /** The active sprint, or null when no project has one. */
  sprintHref: string | null;
  /** That sprint's notes. Null for the same reason. */
  notesHref: string | null;
  /** Admin or lead. RLS refuses an engineer's insert, so the action is not
   *  offered rather than offered and refused. */
  canCreate: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

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
      } else if (event.key === "N" && notesHref) {
        event.preventDefault();
        router.push(notesHref);
      } else if (event.key === "s" && sprintHref) {
        event.preventDefault();
        router.push(sprintHref);
      } else if (event.key === "t" && sprintHref) {
        event.preventDefault();
        router.push(sprintHref);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, sprintHref, notesHref, canCreate]);

  const shell =
    "inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline)] bg-[var(--raised)] px-[13px] text-[13px] font-medium text-[var(--ink)] hover:border-[var(--hairline-strong)] hover:bg-[var(--overlay)] md:h-[34px]";

  return (
    <div className="flex flex-wrap gap-2">
      {canCreate ? (
        <button
          type="button"
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
          Sprint notes
          <Mono size="meta" className="text-[var(--ink-faint)]">
            N
          </Mono>
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

      {sprintHref ? (
        // Time is logged against a story, and the sprint table is where the
        // stories and their hours are. The label says what it does.
        <Link href={sprintHref} className={shell}>
          <Clock size={14} strokeWidth={1.9} aria-hidden className="text-[var(--ink-faint)]" />
          Log time
          <Mono size="meta" className="text-[var(--ink-faint)]">
            t
          </Mono>
        </Link>
      ) : null}
    </div>
  );
}
