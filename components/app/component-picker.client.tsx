"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { CellPopover, optionListKeyDown } from "@/components/app/cell-popover.client";
import { ComponentIcon, ComponentTag, componentAriaLabel } from "@/components/coditu/component-icon";
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
          <ComponentTag component={value} className="text-[13.5px]" />
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

const OPTION =
  "flex w-full items-center gap-2 rounded-chip px-2 py-[7px] text-left text-[13.5px] hover:bg-[var(--canvas)]";
const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

function PickerPanel({
  components,
  value,
  projectSlug,
  emptyLabel,
  allowCreate,
  onChoose,
  onCreated,
}: {
  components: ComponentRef[];
  value: ComponentRef | null;
  projectSlug: string;
  emptyLabel: string;
  allowCreate: boolean;
  onChoose: (next: ComponentRef | null) => void;
  onCreated: (component: ComponentRef) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

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

  const needle = filter.trim().toLowerCase();
  const shown = components.filter((component) => {
    // An archived component stays visible only while it is the current answer:
    // it must not be offered as a new choice, and it must not disappear from
    // the item already carrying it.
    if (component.isArchived && component.id !== value?.id) return false;
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
            if (shown.length === 1) onChoose(shown[0]);
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

      <div
        role="listbox"
        aria-label="Component"
        onKeyDown={optionListKeyDown}
        className="max-h-[280px] overflow-y-auto"
      >
        {!needle ? (
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
            aria-selected={component.id === value?.id}
            title={component.name}
            onClick={() => onChoose(component)}
            className={cn(OPTION, component.id === value?.id && "bg-[var(--canvas)]")}
          >
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
          type="button"
          onClick={submit}
          disabled={pending}
          aria-busy={pending}
          className="signal-gradient h-[30px] flex-1 rounded-control text-[12.5px] font-semibold text-[#07090E] disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
