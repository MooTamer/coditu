"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, Check, ChevronDown, Trash2, Users } from "lucide-react";

import { DialogShell } from "@/components/app/dialog-shell.client";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { FavouriteStar } from "@/components/app/favourite-star.client";
import { deleteView, saveView, setViewShared } from "@/lib/actions/saved-views";
import type { SavedView } from "@/lib/data/saved-views";
import { describeSpec, isSameView, searchFromSpec, specFromSearch } from "@/lib/saved-views";
import { cn } from "@/lib/utils";

/**
 * Saved views, in the sprint toolbar.
 *
 * ## A view is a link, so opening one is a navigation
 *
 * The spec is the query string, so applying a view is `router.push` and nothing
 * else — no state to synchronise, no "is this view still applied" to compute,
 * and the back button undoes it. Which view is current is answered by comparing
 * the spec with the URL, which is why `searchFromSpec` writes its parameters in
 * a fixed order.
 *
 * ## What "Save" means when the name already exists
 *
 * An overwrite. The unique index says one name per person per project, so the
 * alternative is an error somebody has to read and then resolve by inventing
 * `Peer review queue 2`. The button says `Update` when it is about to overwrite,
 * so it is not a surprise.
 *
 * ## Sharing is a property of the view, not a second copy
 *
 * A shared view sits in everybody's menu and stays owned by whoever made it.
 * The policy lets its owner or an admin change or remove it; the menu shows
 * whose it is so that is not a mystery.
 *
 * ## Why this is a panel and not the dropdown the design draws
 *
 * A `position: absolute` dropdown here is trapped for the same reason the
 * filter panel's scrim was: `<Reveal>` sets a transform, which creates a
 * stacking context, and `z-50` inside one cannot paint above a *sibling*
 * context that comes later in the document — the table. The menu opened
 * underneath the table and Playwright reported the header buttons
 * "intercepting pointer events", which is the honest description of what a
 * reader would have experienced.
 *
 * `DialogShell` is already portalled to the body and is already what the Filter
 * control beside this one opens, so the toolbar's three controls now open the
 * same kind of surface — and it is a sheet on a phone, where a dropdown would
 * have been unusable anyway.
 */
export function ViewMenu({
  views,
  projectSlug,
  sprintId,
  starredViews,
}: {
  views: SavedView[];
  projectSlug: string;
  /** The sprint on screen. A view saved against it is pinned to that week. */
  sprintId: string;
  /** Which of these the reader has starred, as ids. */
  starredViews: Set<string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(false);

  const search = params.toString();
  const current = views.find((view) => isSameView(view.spec, search)) ?? null;
  const spec = specFromSearch(search);
  const clash = views.find(
    (view) => view.mine && view.name.trim().toLowerCase() === name.trim().toLowerCase()
  );

  function apply(view: SavedView) {
    setOpen(false);
    const query = searchFromSpec(view.spec);
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await settle(
        () =>
          saveView({
            projectSlug,
            sprintId: pinned ? sprintId : null,
            name: trimmed,
            spec,
            isShared: shared,
          }),
        "That view could not be saved."
      );

      if (!result.ok) {
        toast(result.error ?? "That view could not be saved.");
        return;
      }

      setSaving(false);
      setOpen(false);
      setName("");
      toast(clash ? `“${trimmed}” updated.` : `“${trimmed}” saved.`);
      router.refresh();
    });
  }

  function remove(view: SavedView) {
    startTransition(async () => {
      const result = await settle(
        () => deleteView({ id: view.id, projectSlug }),
        "That view could not be removed."
      );
      if (!result.ok) {
        toast(result.error ?? "That view could not be removed.");
        return;
      }
      toast(`“${view.name}” removed.`);
      router.refresh();
    });
  }

  function share(view: SavedView) {
    startTransition(async () => {
      const result = await settle(
        () => setViewShared({ id: view.id, isShared: !view.isShared, projectSlug }),
        "That view could not be changed."
      );
      if (!result.ok) {
        toast(result.error ?? "That view could not be changed.");
        return;
      }
      toast(view.isShared ? `“${view.name}” is private again.` : `“${view.name}” shared.`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-view-menu
        className="inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink)] hover:border-[var(--hairline-strong)]"
      >
        <Bookmark size={13} strokeWidth={1.8} aria-hidden className="text-[var(--ink-faint)]" />
        {/* The name of what you are looking at, or the honest absence of one. */}
        {current ? current.name : searchFromSpec(spec) ? "Custom view" : "Default order"}
        <ChevronDown size={13} strokeWidth={2} aria-hidden className="text-[var(--ink-faint)]" />
      </button>

      {open ? (
        <DialogShell
          label="Views"
          maxWidth={420}
          onClose={() => {
            setOpen(false);
            setSaving(false);
          }}
          header={<span className="text-[15px] font-semibold">Views</span>}
          footer={
            saving ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
                className="flex flex-col gap-2"
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="Peer review queue"
                  aria-label="Name for this view"
                  className="h-11 rounded-control border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-[max(16px,13px)] outline-none"
                />
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[var(--ink-muted)]">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(event) => setShared(event.target.checked)}
                    className="size-4"
                  />
                  Share it with the team
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[var(--ink-muted)]">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(event) => setPinned(event.target.checked)}
                    className="size-4"
                  />
                  Only this sprint
                </label>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className={cn(
                    "signal-gradient h-10 rounded-control text-[13px] font-semibold text-[#07090E]",
                    name.trim() ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                  )}
                >
                  {/* An overwrite is said out loud rather than discovered. */}
                  {clash ? `Update “${clash.name}”` : "Save view"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSaving(true);
                  setName(current?.name ?? "");
                  setShared(current?.isShared ?? false);
                  setPinned(Boolean(current?.sprintId));
                }}
                data-save-view
                className="h-10 w-full cursor-pointer rounded-control border border-[var(--hairline-strong)] text-[13px] font-medium hover:bg-[var(--canvas)]"
              >
                Save current as view
              </button>
            )
          }
        >
        <div className="flex flex-col py-1">
          {views.length === 0 ? (
            <p className="px-[14px] py-4 text-[13px] leading-[1.5] text-[var(--ink-muted)]">
              No saved views yet. Filter and sort the table, then save it as one.
            </p>
          ) : null}

          {views.map((view) => (
            <div
              key={view.id}
              className={cn(
                "flex items-center gap-1 pr-2 hover:bg-[var(--canvas)]",
                current?.id === view.id && "bg-[var(--canvas)]"
              )}
            >
              {/* Three sibling controls, so each says what it DOES rather than
                  leaving "E2E review queue" to mean open, share and remove
                  depending on which pixel you hit. */}
              <button
                type="button"
                onClick={() => apply(view)}
                aria-label={`Open ${view.name} — ${describeSpec(view.spec)}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] py-[9px] pl-[14px] text-left"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {current?.id === view.id ? (
                    <Check size={13} strokeWidth={2.4} aria-hidden className="text-[var(--accent)]" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{view.name}</span>
                  <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
                    {describeSpec(view.spec)}
                    {view.mine ? "" : ` · ${view.owner.initials}`}
                    {view.sprintId ? " · this sprint" : ""}
                  </Mono>
                </span>
                {current?.id === view.id ? <span className="sr-only">— the view you are looking at</span> : null}
              </button>

              {/* Starring is not an owner's privilege — a shared view somebody
                  else made is exactly the kind of thing worth keeping at the
                  top of your own sidebar, so this sits outside the `view.mine`
                  branch that guards share and remove. */}
              <FavouriteStar
                kind="saved_view"
                targetId={view.id}
                label={view.name}
                starred={starredViews.has(view.id)}
              />

              {view.mine ? (
                <>
                  <button
                    type="button"
                    onClick={() => share(view)}
                    aria-pressed={view.isShared}
                    title={view.isShared ? `Stop sharing ${view.name}` : `Share ${view.name} with the team`}
                    className={cn(
                      "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control",
                      view.isShared ? "text-[var(--accent)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    )}
                  >
                    <Users size={13} strokeWidth={1.9} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(view)}
                    title={`Remove ${view.name}`}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-[var(--ink-faint)] hover:text-[var(--rose)]"
                  >
                    <Trash2 size={13} strokeWidth={1.9} aria-hidden />
                  </button>
                </>
              ) : (
                // Somebody else's. Whose, rather than a control that would fail.
                <Mono size="meta" className="shrink-0 px-2 text-[var(--ink-faint)]">
                  shared
                </Mono>
              )}
            </div>
          ))}

        </div>
        </DialogShell>
      ) : null}
    </>
  );
}
