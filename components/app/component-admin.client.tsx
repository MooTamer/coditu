"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { CellPopover } from "@/components/app/cell-popover.client";
import { AddComponent } from "@/components/app/component-picker.client";
import { ComponentIcon } from "@/components/coditu/component-icon";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { updateComponent } from "@/lib/actions/components";
import { COMPONENT_KINDS, COMPONENT_KIND_LABEL } from "@/lib/components";
import type { ComponentRef } from "@/lib/data/components";
import { cn } from "@/lib/utils";

/**
 * Managing the registry: adding one from the registry page, and correcting one
 * from its own page.
 *
 * Both are client islands on otherwise server-rendered pages, and both reuse
 * the popover the table cells use — so "add a component" looks and behaves the
 * same whether it is reached from the New item dialog, from a row, or from
 * here.
 */

const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)]";

export function NewComponentButton({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();

  return (
    <div className="w-[200px]">
      <CellPopover
        variant="field"
        align="end"
        width={300}
        label="Add a component"
        value={
          <span className="flex items-center gap-2 text-[13.5px] font-medium">
            <Plus size={14} strokeWidth={2} aria-hidden />
            New component
          </span>
        }
      >
        {(close) => (
          <AddComponent
            projectSlug={projectSlug}
            initialName=""
            onCancel={close}
            onCreated={() => {
              close();
              router.refresh();
            }}
          />
        )}
      </CellPopover>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Rename a component, correct its kind, retire it.
 *
 * No delete, and the panel says why rather than leaving a reader hunting for
 * one: the rows pointing at this component are the history it exists to hold.
 *
 * The slug is deliberately not editable and does not follow a rename — this
 * page's own URL is the one somebody pasted into a comment in March.
 */
export function ComponentSettings({
  component,
  canEdit,
}: {
  component: ComponentRef;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(component.name);
  const [kind, setKind] = useState(component.kind);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: Parameters<typeof updateComponent>[0], close?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await settle(
        () => updateComponent(patch),
        "That change did not save — check your connection."
      );
      if (result.ok) {
        close?.();
        router.refresh();
      } else {
        setError(result.error ?? "That change did not save.");
      }
    });
  }

  if (!canEdit) return null;

  return (
    <div className="w-[190px]">
      <CellPopover
        variant="field"
        align="end"
        width={280}
        busy={pending}
        label={`Settings for ${component.name}`}
        value={<span className="text-[13.5px] font-medium">Component settings</span>}
      >
        {(close) => (
          <div className="flex flex-col gap-3 p-2">
            <label className="flex flex-col gap-[6px]">
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                Name
              </Mono>
              <input
                data-autofocus=""
                className={FIELD}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    save({ componentId: component.id, name }, close);
                  }
                }}
              />
            </label>

            <fieldset className="flex flex-col gap-[6px]">
              <legend className="sr-only">Component type</legend>
              <Mono size="eyebrow" className="text-[var(--ink-faint)]">
                Type
              </Mono>
              <div className="flex rounded-control border border-[var(--hairline)] bg-[var(--canvas)] p-[3px]">
                {COMPONENT_KINDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    aria-pressed={kind === option}
                    className={cn(
                      "flex h-[30px] flex-1 items-center justify-center gap-[6px] rounded-[7px] text-[12.5px] font-semibold",
                      kind === option ? "bg-[var(--raised)] text-[var(--ink)]" : "text-[var(--ink-muted)]"
                    )}
                  >
                    <ComponentIcon icon={null} kind={option} size={13} />
                    {COMPONENT_KIND_LABEL[option]}
                  </button>
                ))}
              </div>
            </fieldset>

            {error ? (
              <p role="alert" className="text-[12.5px] text-[var(--rose)]">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() => save({ componentId: component.id, name, kind }, close)}
              className="signal-gradient h-[32px] rounded-control text-[12.5px] font-semibold text-[#07090E] disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>

            <div className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  save({ componentId: component.id, isArchived: !component.isArchived }, close)
                }
                className="h-[30px] rounded-control border border-[var(--hairline)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
              >
                {component.isArchived ? "Bring it back" : "Retire it"}
              </button>
              <p className="text-[12px] leading-[1.45] text-[var(--ink-faint)]">
                {component.isArchived
                  ? "Retired: it keeps its history and is not offered when attributing an item."
                  : "Retiring takes it out of the pickers and keeps every item that names it. There is no delete — that history is the point."}
              </p>
            </div>
          </div>
        )}
      </CellPopover>
    </div>
  );
}
