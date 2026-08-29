"use client";

import { useCallback, useState } from "react";
import { Search } from "lucide-react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { Mono } from "@/components/coditu/mono";
import { useUrlWrite } from "@/lib/hooks/use-url-write";
import { control, type ControlState } from "@/lib/interactive";
import { NONE, type FilterSpec } from "@/lib/sprint-filters";
import { TYPE_LABEL, WORK_ITEM_TYPES, type WorkItemType } from "@/lib/work-items";
import { cn } from "@/lib/utils";

/**
 * Type, assignee, reviewer, grouping and free text — the half of the filter set
 * that does not fit in the bar.
 *
 * ## Why a panel and not more chips
 *
 * Status is eight chips and the component picker is one control; adding four
 * more dimensions inline gives a toolbar that wraps to three rows at 1180px and
 * hides the table below the fold. The design draws a `Filter` button with a
 * count, and `DialogShell` is already a centred dialog above `md` and a **bottom
 * sheet below it** — so the phone behaviour the brief asks for costs nothing
 * here.
 *
 * ## Why the text box is in the panel
 *
 * ⌘K is how you *find* a story. `?q=` is how you narrow the table you are
 * looking at, which is a considered act and a link you then paste. Putting it in
 * the bar would be a second search box six inches from the first one, meaning
 * something different.
 *
 * ## Everything writes the URL, nothing holds state
 *
 * Except the text box, which holds a draft until it is submitted — a URL write
 * per keystroke is a server round trip per keystroke.
 */
export function FilterPanel({
  open,
  onClose,
  spec,
  people,
  groupings,
}: {
  open: boolean;
  onClose: () => void;
  spec: FilterSpec;
  /** Everybody this sprint could be filtered by, from its own rows. */
  people: { initials: string; fullName: string }[];
  /** The groupings this sprint actually uses. A menu of numbers nobody has used
   *  is a menu of empty tables. */
  groupings: number[];
}) {
  // PF-4. Twenty-odd pills, every one of them a server round trip that used to
  // announce nothing. `state(key)` is what tells the ONE that was pressed to
  // say so.
  const { params, write: writeUrl, state } = useUrlWrite();
  const [draft, setDraft] = useState(params.get("q") ?? "");

  const write = useCallback(
    (mutate: (next: URLSearchParams) => void, key?: string) => {
      const next = new URLSearchParams(params);
      mutate(next);
      writeUrl(next, key);
    },
    [params, writeUrl]
  );

  /** One value in one dimension, on or off. */
  const toggle = useCallback(
    (key: string, value: string, active: string[]) => {
      const on = active.includes(value);
      const updated = on ? active.filter((entry) => entry !== value) : [...active, value];
      write((next) => {
        if (updated.length) next.set(key, updated.join(","));
        else next.delete(key);
      }, `${key}:${value}`);
    },
    [write]
  );

  if (!open) return null;

  const assignees = spec.assignees.map(String);
  const reviewers = spec.reviewers.map(String);
  const groupingValues = spec.groupings.map(String);
  const types = spec.types.map(String);

  return (
    <DialogShell
      label="Filter"
      onClose={onClose}
      maxWidth={520}
      header={<span className="text-[15px] font-semibold">Filter</span>}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft("");
              write((next) => {
                for (const key of ["type", "assignee", "reviewer", "grouping", "q"]) {
                  next.delete(key);
                }
              }, "clear");
            }}
            {...control(state("clear"))}
            className="h-[38px] flex-1 cursor-pointer rounded-control border border-[var(--hairline-strong)] text-[13px] hover:bg-[var(--canvas)]"
          >
            Clear these filters
          </button>
          <button
            type="button"
            onClick={onClose}
            className="signal-gradient h-[38px] flex-1 cursor-pointer rounded-control text-[13px] font-semibold text-[#07090E]"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 p-4">
        {/* Submitted, not typed. A URL write per keystroke is a server render
            per keystroke, and the back button would then hold every prefix of
            what somebody typed. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            write((next) => {
              if (value) next.set("q", value);
              else next.delete("q");
            });
          }}
        >
          <Group label="Words in the title or description">
            <div className="flex items-center gap-2 rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-3">
              <Search size={14} strokeWidth={1.8} aria-hidden className="text-[var(--ink-faint)]" />
              <input
                type="search"
                name="q"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="kachel height"
                aria-label="Filter by words in the title or description"
                // 16px on a phone, or iOS zooms the whole page when it takes
                // focus — the rule `globals.css` already states for the editor.
                className="h-11 flex-1 bg-transparent text-[max(16px,13.5px)] outline-none placeholder:text-[var(--ink-faint)]"
              />
              <button
                type="submit"
                className="h-8 shrink-0 cursor-pointer rounded-chip px-2 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--raised)]"
              >
                Apply
              </button>
            </div>
          </Group>
        </form>

        <Group label="Type">
          {WORK_ITEM_TYPES.map((type) => (
            <Pill
              key={type}
              on={types.includes(type)}
              onClick={() => toggle("type", type, types)}
              state={state(`type:${type}`)}
              label={TYPE_LABEL[type as WorkItemType]}
            />
          ))}
        </Group>

        <Group label="Assignee">
          {people.map((person) => (
            <Pill
              key={`a-${person.initials}`}
              on={assignees.includes(person.initials.toUpperCase())}
              onClick={() => toggle("assignee", person.initials.toUpperCase(), assignees)}
              state={state(`assignee:${person.initials.toUpperCase()}`)}
              label={person.fullName}
              mono={person.initials}
            />
          ))}
          <Pill
            on={assignees.includes(NONE)}
            onClick={() => toggle("assignee", NONE, assignees)}
              state={state(`assignee:${NONE}`)}
            label="unassigned"
          />
        </Group>

        <Group label="Reviewer">
          {people.map((person) => (
            <Pill
              key={`r-${person.initials}`}
              on={reviewers.includes(person.initials.toUpperCase())}
              onClick={() => toggle("reviewer", person.initials.toUpperCase(), reviewers)}
              state={state(`reviewer:${person.initials.toUpperCase()}`)}
              label={person.fullName}
              mono={person.initials}
            />
          ))}
          <Pill
            on={reviewers.includes(NONE)}
            onClick={() => toggle("reviewer", NONE, reviewers)}
              state={state(`reviewer:${NONE}`)}
            label="no reviewer"
          />
        </Group>

        <Group label="Grouping">
          {groupings.map((grouping) => (
            <Pill
              key={grouping}
              on={groupingValues.includes(String(grouping))}
              onClick={() => toggle("grouping", String(grouping), groupingValues)}
              state={state(`grouping:${grouping}`)}
              label={`grouping ${grouping}`}
            />
          ))}
          <Pill
            on={groupingValues.includes(NONE)}
            onClick={() => toggle("grouping", NONE, groupingValues)}
              state={state(`grouping:${NONE}`)}
            label="ungrouped"
          />
        </Group>
      </div>
    </DialogShell>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <Mono
        as="legend"
        size="eyebrow"
        className="text-[9.5px] tracking-[0.07em] text-[var(--ink-faint)]"
      >
        {label}
      </Mono>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * `aria-pressed` rather than a checkbox, matching the status chips in the bar:
 * these are toggles that re-run a query, not fields in a form that gets
 * submitted.
 */
function Pill({
  on,
  onClick,
  label,
  mono,
  state = "idle",
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  mono?: string;
  /** This pill's own wait, not the panel's. */
  state?: ControlState;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      {...control(state)}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-[13px]",
        "transition-[background-color,border-color,color] duration-[var(--dur-micro)]",
        on
          ? "border-[var(--hairline-strong)] bg-[var(--canvas)] font-medium text-[var(--ink)]"
          : "border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--hairline-strong)]"
      )}
    >
      {mono ? (
        <Mono size="meta" className="text-[10px] text-[var(--ink-faint)]">
          {mono}
        </Mono>
      ) : null}
      {label}
    </button>
  );
}
