"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { CellPopover, optionListKeyDown } from "@/components/app/cell-popover.client";
import {
  ComponentIcon,
  ComponentTags,
  componentAriaLabel,
} from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { createComponent } from "@/lib/actions/components";
import {
  COMPONENT_KINDS,
  COMPONENT_KIND_HINT,
  COMPONENT_KIND_LABEL,
  type ComponentKind,
} from "@/lib/components";
import type { ComponentRef } from "@/lib/data/components";
import { cn } from "@/lib/utils";
import { control } from "@/lib/interactive";

/**
 * Choose the thing an item changes — and add one when it is not on the list
 * yet.
 *
 * ── Why this is a listbox and not a `<select>` ─────────────────────────────
 * Two reasons, and the second is the one that decided it. A native `<option>`
 * cannot carry the web part's toolbox icon, which is the whole point of storing
 * it: the team recognises *EVIM Themen Kachel* by the grid glyph in SharePoint,
 * and a picker that drops it makes them read forty near-identical names
 * instead. And a project has forty of them, so it needs a filter — which a
 * `<select>` also cannot have.
 *
 * What it does keep from a `<select>`: `role="listbox"` with `aria-selected`,
 * arrow-key traversal (`optionListKeyDown`), Escape to dismiss, focus returned
 * to the trigger. That is the contract, and it is the same contract the status
 * and assignee menus in the table already honour.
 *
 * ── Why creating lives in here ─────────────────────────────────────────────
 * "It is not in the list" happens at exactly the moment you are looking at the
 * list, and sending somebody to a settings screen to come back and start again
 * is how a required field ends up empty. Both surfaces that pick a component
 * get the same add-a-component form because both of them are the moment.
 */
export function ComponentPicker({
  components,
  value,
  alsoTagged = [],
  projectSlug,
  canEdit,
  onChange,
  variant = "cell",
  align = "start",
  busy,
  className,
  emptyLabel = "no component",
  allowCreate = true,
  label = "Component",
  disabledReason = "Only an admin or lead can change an item's component",
}: {
  /** Every component in the project, archived ones included. */
  components: ComponentRef[];
  value: ComponentRef | null;
  /**
   * The item's OTHER components, shown on the trigger but not edited by it.
   *
   * Choosing here writes `work_items.component_id`, which the schema promotes
   * to first while keeping the rest — so an item can be tagged with a component
   * this control is not naming. That matters because the sprint filter matches
   * ANY tag: without these, a row can be in a filtered table while the cell
   * shows a different component, which reads as the filter being broken.
   */
  alsoTagged?: readonly ComponentRef[];
  /** Where a newly created component belongs. Resolved server-side. */
  projectSlug: string;
  /** Admin or lead. An engineer sees the value and cannot change it. */
  canEdit: boolean;
  onChange: (next: ComponentRef | null) => void;
  variant?: "cell" | "field";
  align?: "start" | "end";
  busy?: boolean;
  className?: string;
  emptyLabel?: string;
  /** The sprint filter reuses this picker to CHOOSE one, not to add one. */
  allowCreate?: boolean;
  /** The noun announced on the trigger. "Component" everywhere but the filter. */
  label?: string;
  /** Why it cannot be changed, in words. A control that disappears reads as a bug. */
  disabledReason?: string;
}) {
  const router = useRouter();
  // Components created from inside the picker, held until the server tree
  // catches up. Without this the option you just made vanishes from the list
  // the moment the panel re-renders, which reads as a failed write.
  const [created, setCreated] = useState<ComponentRef[]>([]);

  const all = useMemo(() => {
    const merged = [...components];
    for (const component of created) {
      if (!merged.some((existing) => existing.id === component.id)) merged.push(component);
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [components, created]);

  return (
    <CellPopover
      variant={variant}
      align={align}
      // 340, not 300: at 300 the kind label squeezes "EVIM Rollover Contact
      // Cards" down to about twenty characters, and a picker whose whole job is
      // telling forty similar names apart must not truncate the part that tells
      // them apart.
      width={340}
      busy={busy}
      disabled={!canEdit}
      disabledReason={disabledReason}
      label={`${label}: ${componentAriaLabel(value)}. Change ${label.toLowerCase()}.`}
      className={className}
      value={
        value ? (
          <ComponentTags
            components={[value, ...alsoTagged]}
            itemClassName="text-[13.5px]"
            className="text-[13.5px]"
          />
        ) : (
          <span className="truncate text-[13.5px] text-[var(--ink-faint)]">{emptyLabel}</span>
        )
      }
    >
      {(close) => (
        <PickerPanel
          components={all}
          value={value}
          projectSlug={projectSlug}
          emptyLabel={emptyLabel}
          allowCreate={allowCreate}
          onChoose={(next) => {
            close();
            if ((next?.id ?? null) !== (value?.id ?? null)) onChange(next);
          }}
          onCreated={(component) => {
            setCreated((was) => [...was, component]);
            close();
            onChange(component);
            // The registry page and every other picker on the screen are stale
            // the moment this returns.
            router.refresh();
          }}
        />
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The same picker, for a story that is about more than one thing.
 *
 * Ticking does not close the panel. That is the whole difference and it is the
 * point: choosing three components is one decision, and a control that dismisses
 * itself after each tick turns it into three, each with its own round trip and
 * its own chance to be interrupted half way.
 *
 * So the panel accumulates and the WHOLE set is sent when it closes. `onChange`
 * fires once, with what the reader is looking at.
 */
export function ComponentMultiPicker({
  components,
  selected,
  projectSlug,
  canEdit,
  onChange,
  variant = "cell",
  align = "start",
  busy,
  className,
  emptyLabel = "not attributed",
  allowCreate = true,
  allowSelectAll = true,
  disabledReason = "Only an admin or lead can change an item's components",
}: {
  components: ComponentRef[];
  selected: readonly ComponentRef[];
  projectSlug: string;
  canEdit: boolean;
  /** Called once, on close, and only when the set actually changed. */
  onChange: (next: ComponentRef[]) => void;
  variant?: "cell" | "field";
  align?: "start" | "end";
  busy?: boolean;
  className?: string;
  emptyLabel?: string;
  allowCreate?: boolean;
  /**
   * PF-7's presets. On by default, and OFF in the sprint filter.
   *
   * In the filter, selecting nothing already means *all components* — so a
   * `Select all` there writes forty slugs into the URL to express what an empty
   * parameter expresses in none of them, and the toolbar chip would then have
   * two ways to say the same thing.
   */
  allowSelectAll?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<ComponentRef[]>([]);

  // What the panel is holding while it is open. Seeded from the props each time
  // it opens, so a realtime refresh underneath a closed picker is not fought.
  const [draft, setDraft] = useState<ComponentRef[] | null>(null);
  const working = draft ?? [...selected];

  const all = useMemo(() => {
    const merged = [...components];
    for (const component of created) {
      if (!merged.some((existing) => existing.id === component.id)) merged.push(component);
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [components, created]);

  const sameAsProps = (next: readonly ComponentRef[]) => {
    if (next.length !== selected.length) return false;
    const held = new Set(selected.map((component) => component.id));
    return next.every((component) => held.has(component.id));
  };

  function commit() {
    const next = draft;
    setDraft(null);
    if (next && !sameAsProps(next)) onChange(next);
  }

  return (
    <CellPopover
      variant={variant}
      align={align}
      width={340}
      busy={busy}
      disabled={!canEdit}
      disabledReason={disabledReason}
      label={
        selected.length
          ? `Components: ${selected.map((component) => component.name).join(", ")}. Change components.`
          : "Components: none. Change components."
      }
      className={className}
      onClose={commit}
      value={
        <ComponentTags
          components={selected}
          itemClassName="text-[13.5px]"
          className="text-[13.5px]"
          emptyLabel={emptyLabel}
        />
      }
    >
      {(close) => (
        <PickerPanel
          components={all}
          value={null}
          selectedIds={working.map((component) => component.id)}
          projectSlug={projectSlug}
          emptyLabel={emptyLabel}
          allowCreate={allowCreate}
          onChoose={() => close()}
          onToggle={(component) =>
            setDraft(
              working.some((held) => held.id === component.id)
                ? working.filter((held) => held.id !== component.id)
                : [...working, component]
            )
          }
          /**
           * PF-7. Select-all and shift-range both land here, and both are ONE
           * edit of the draft rather than a loop of `onToggle` — which would be
           * forty renders and, if it ever escaped the panel, forty writes.
           *
           * The panel still commits once when it closes, so ticking forty boxes
           * and ticking one cost the same single call to
           * `setWorkItemComponents`, which takes the whole set and works out
           * the difference itself.
           */
          allowSelectAll={allowSelectAll}
          onSetMany={(group, picked) => {
            const ids = new Set(group.map((component) => component.id));
            setDraft(
              picked
                ? [...working.filter((held) => !ids.has(held.id)), ...group]
                : working.filter((held) => !ids.has(held.id))
            );
          }}
          onCreated={(component) => {
            setCreated((was) => [...was, component]);
            setDraft([...working, component]);
            // The registry page and every other picker on the screen are stale
            // the moment this returns.
            router.refresh();
          }}
        />
      )}
    </CellPopover>
  );
}

/* -------------------------------------------------------------------------- */

const OPTION =
  "flex w-full items-center gap-2 rounded-chip px-2 py-[7px] text-left text-[13.5px] hover:bg-[var(--canvas)]";
const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";
/**
 * The two presets above a multi-select list.
 *
 * 44px on a coarse pointer and 26px on a fine one, the same pair of heights the
 * rest of the app uses — the picker opens inside a sheet on a phone and these
 * are the newest thing in it that a thumb has to hit.
 */
const PRESET =
  "inline-flex min-h-11 cursor-pointer items-center rounded-chip border border-[var(--hairline)] px-2 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-[var(--accent)] aria-pressed:text-[var(--accent)] md:min-h-[26px]";

function PickerPanel({
  components,
  value,
  selectedIds,
  projectSlug,
  emptyLabel,
  allowCreate,
  onChoose,
  onToggle,
  onSetMany,
  allowSelectAll = true,
  onCreated,
}: {
  components: ComponentRef[];
  /** Single-select: the current answer. Null in multi-select. */
  value: ComponentRef | null;
  /**
   * Multi-select: every component currently ticked.
   *
   * Its presence is what switches the panel's behaviour — ticking does not
   * close it, there is no "none" option because unticking everything IS none,
   * and the listbox announces itself as multi-selectable.
   */
  selectedIds?: readonly string[];
  projectSlug: string;
  emptyLabel: string;
  allowCreate: boolean;
  onChoose: (next: ComponentRef | null) => void;
  onToggle?: (component: ComponentRef) => void;
  /** Multi-select: tick or untick a whole group in one edit. See PF-7. */
  onSetMany?: (components: ComponentRef[], picked: boolean) => void;
  /** Whether to draw the Select all / Select none row. See PF-7. */
  allowSelectAll?: boolean;
  onCreated: (component: ComponentRef) => void;
}) {
  const multi = selectedIds !== undefined;
  const isPicked = (component: ComponentRef) =>
    multi ? selectedIds!.includes(component.id) : component.id === value?.id;
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  /**
   * The anchor a shift-range extends from: the last option touched on its own.
   *
   * Held as an ID rather than an index, because the filter can change the list
   * under it and an index would silently point at a different component. When
   * the anchor is not in the shown list — filtered away, or never set — there
   * is nothing to extend from and a shift-click is an ordinary toggle, which is
   * the honest answer rather than a range drawn from a guess.
   */
  const [anchorId, setAnchorId] = useState<string | null>(null);

  if (adding && allowCreate) {
    return (
      <AddComponent
        projectSlug={projectSlug}
        initialName={filter.trim()}
        onCancel={() => setAdding(false)}
        onCreated={onCreated}
      />
    );
  }

  /**
   * PF-7's range select.
   *
   * Shift and a click — or Shift with Enter or Space, which is the same thing
   * from the keyboard and is why this is not a `click` handler — extends from
   * the anchor to the option in hand and sets the WHOLE run to what the clicked
   * option is becoming. That is the behaviour of every file list and every
   * spreadsheet: the destination decides, and the run follows it.
   *
   * Without an anchor, or without Shift, it is an ordinary toggle and the
   * option becomes the new anchor.
   */
  function pick(component: ComponentRef, extend: boolean) {
    const picked = !isPicked(component);
    const from = extend && anchorId ? shown.findIndex((row) => row.id === anchorId) : -1;
    const to = shown.findIndex((row) => row.id === component.id);

    if (from !== -1 && to !== -1 && onSetMany) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      onSetMany(shown.slice(start, end + 1), picked);
      // The anchor deliberately stays put, so a second shift-click re-draws the
      // range from the same place rather than from wherever the last one ended.
      return;
    }

    setAnchorId(component.id);
    onToggle?.(component);
  }

  const needle = filter.trim().toLowerCase();
  const shown = components.filter((component) => {
    // An archived component stays visible only while it is the current answer:
    // it must not be offered as a new choice, and it must not disappear from
    // the item already carrying it.
    // An archived component stays visible only while it is a current answer:
    // it must not be offered as a NEW choice, and it must not disappear from an
    // item already carrying it.
    if (component.isArchived && !isPicked(component)) return false;
    return !needle || component.name.toLowerCase().includes(needle);
  });

  return (
    <div className="flex flex-col gap-1 p-1">
      <input
        data-autofocus=""
        className={FIELD}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter components"
        aria-label="Filter components"
        onKeyDown={(event) => {
          // Enter on a single match picks it — the fast path when you know the
          // name and typed four letters of it.
          if (event.key === "Enter") {
            event.preventDefault();
            if (shown.length !== 1) return;
            if (multi) onToggle?.(shown[0]);
            else onChoose(shown[0]);
            return;
          }
          // ArrowDown hands over to the list.
          //
          // `optionListKeyDown` gives the options roving focus, but it is bound
          // to the list and a keypress in this input is a SIBLING's event — it
          // never reaches it. Without this line the only way out of the filter
          // box is Tab, which is not what a filtered list looks like it does.
          if (event.key === "ArrowDown") {
            event.preventDefault();
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>('[role="listbox"] button')
              ?.focus();
          }
        }}
      />

      {multi && allowSelectAll ? (
        /**
         * PF-7 — "select all components at once in a story (global changes)".
         *
         * Scoped to what is SHOWN, not to the registry: with a filter typed,
         * "Select all" means the eight things you are looking at, which is the
         * useful reading and the only one that can be checked at a glance. The
         * label says so when a filter is on.
         *
         * Two toggles rather than a radio pair, carrying `aria-pressed` for
         * whether the current selection IS that state — the same contract the
         * export dialog's presets got in PF-11, and for the same reason: a
         * hand-picked selection matches neither, and *neither pressed* is the
         * honest answer.
         */
        <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
          <button
            type="button"
            data-select-all=""
            aria-pressed={shown.length > 0 && shown.every(isPicked)}
            disabled={shown.length === 0}
            onClick={() => onSetMany?.(shown, true)}
            className={PRESET}
          >
            {needle ? `Select all ${shown.length}` : "Select all"}
          </button>
          <button
            type="button"
            data-select-none=""
            aria-pressed={shown.length > 0 && !shown.some(isPicked)}
            disabled={shown.length === 0}
            onClick={() => onSetMany?.(shown, false)}
            className={PRESET}
          >
            Select none
          </button>
          {/* Just the count. "N of M" would have to say which M — the registry,
              or the filtered list — and it is a different number in each case;
              the number that matters is on `Select all` when a filter is on. */}
          <Mono size="meta" className="ml-auto shrink-0 tabular-nums text-[var(--ink-faint)]">
            {selectedIds!.length} selected
          </Mono>
        </div>
      ) : null}

      <div
        role="listbox"
        aria-label={multi ? "Components" : "Component"}
        aria-multiselectable={multi || undefined}
        onKeyDown={optionListKeyDown}
        className="max-h-[280px] overflow-y-auto"
      >
        {!needle && !multi ? (
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            onClick={() => onChoose(null)}
            className={cn(OPTION, value === null && "bg-[var(--canvas)]")}
          >
            <span className="truncate text-[var(--ink-faint)]">{emptyLabel}</span>
          </button>
        ) : null}

        {shown.map((component) => (
          <button
            key={component.id}
            type="button"
            role="option"
            aria-selected={isPicked(component)}
            title={component.name}
            onClick={(event) =>
              multi ? pick(component, event.shiftKey) : onChoose(component)
            }
            onKeyDown={(event) => {
              // Shift+Enter and Shift+Space are the range gesture from the
              // keyboard. Without them "select a run" would be a mouse-only
              // feature, which is the shape this app does not ship — the sort
              // panel's drag handle carries the same argument.
              if (!multi || !event.shiftKey) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              pick(component, true);
            }}
            className={cn(OPTION, isPicked(component) && "bg-[var(--canvas)]")}
          >
            {multi ? (
              // A tick box, drawn rather than a real checkbox: the row is
              // already a listbox option and `aria-selected` is what announces
              // its state. A nested input would be a second, contradictory one.
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border",
                  isPicked(component)
                    ? "border-transparent bg-[var(--accent)] text-[var(--canvas)]"
                    : "border-[var(--hairline-strong)]"
                )}
              >
                {isPicked(component) ? (
                  <svg viewBox="0 0 24 24" className="size-[11px]" fill="none" stroke="currentColor" strokeWidth={3.2}>
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                ) : null}
              </span>
            ) : null}
            <ComponentIcon icon={component.icon} kind={component.kind} size={15} />
            <span className="min-w-0 flex-1 truncate">{component.name}</span>
            <Mono size="eyebrow" className="shrink-0 normal-case tracking-normal text-[var(--ink-faint)]">
              {COMPONENT_KIND_LABEL[component.kind]}
            </Mono>
          </button>
        ))}

        {shown.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] text-[var(--ink-faint)]">
            Nothing matches “{filter.trim()}”.
          </p>
        ) : null}
      </div>

      {allowCreate ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 border-t border-[var(--hairline)] px-2 py-[9px] text-left text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
          {filter.trim() ? `New component “${filter.trim()}”` : "New component"}
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The add-a-component form.
 *
 * Exported because the registry page opens the same one from its own button —
 * two ways to reach a form should not mean two forms with two sets of
 * validation.
 */
export function AddComponent({
  projectSlug,
  initialName,
  onCancel,
  onCreated,
}: {
  projectSlug: string;
  /** Whatever was typed into the filter — almost always the name meant. */
  initialName: string;
  onCancel: () => void;
  onCreated: (component: ComponentRef) => void;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<ComponentKind>("spfx");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A component needs a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await settle(
        () => createComponent({ projectSlug, name: trimmed, kind }),
        "That component did not save — check your connection."
      );
      if (result.ok && result.component) onCreated(result.component);
      else setError(result.error ?? "That component did not save.");
    });
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      <Mono size="eyebrow" className="text-[var(--ink-faint)]">
        New component
      </Mono>

      <label className="flex flex-col gap-[6px]">
        <span className="sr-only">Component name</span>
        <input
          data-autofocus=""
          className={FIELD}
          value={name}
          maxLength={80}
          placeholder="EVIM Newspart"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>

      <fieldset className="flex flex-col gap-[6px]">
        <legend className="sr-only">Component type</legend>
        <div className="flex rounded-control border border-[var(--hairline)] bg-[var(--canvas)] p-[3px]">
          {COMPONENT_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
              className={cn(
                "flex h-[30px] flex-1 items-center justify-center gap-[6px] rounded-[7px] text-[12.5px] font-semibold",
                "transition-[background-color,color] duration-[var(--dur-micro)]",
                kind === option
                  ? "bg-[var(--raised)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)]"
              )}
            >
              <ComponentIcon icon={null} kind={option} size={13} />
              {COMPONENT_KIND_LABEL[option]}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-[1.45] text-[var(--ink-faint)]">
          {COMPONENT_KIND_HINT[kind]}
        </p>
      </fieldset>

      {error ? (
        <p role="alert" className="text-[12.5px] text-[var(--rose)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-[30px] flex-1 rounded-control border border-[var(--hairline)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          Cancel
        </button>
        <button
        {...control(pending ? "pending" : "idle")}
          type="button"
          onClick={submit}
          disabled={pending}
          className="signal-gradient h-[30px] flex-1 rounded-control text-[12.5px] font-semibold text-[#07090E] disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
