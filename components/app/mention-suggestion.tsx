"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";

import type { ProfileRef } from "@/lib/data/profiles";

/**
 * The `@` mention list.
 *
 * Rendered as a plain DOM popup rather than a React portal: TipTap's suggestion
 * plugin lives inside ProseMirror's own lifecycle, and mounting a React tree
 * from inside it means two renderers fighting over the same subtree. A few
 * lines of DOM here is the smaller cost.
 *
 * Arrow keys move, Enter picks, Escape dismisses without inserting. The chosen
 * node stores the profile UUID; the label is only what the author saw.
 */
export function buildMentionSuggestion(
  people: ProfileRef[],
  /**
   * Told when the list opens and closes — see `slash-suggestion.tsx` for why.
   * Escape has never dismissed this list: the editor's own `handleKeyDown` runs
   * first and blurs the whole editor instead. Nothing asserted it, so nothing
   * said so.
   */
  onOpenChange?: (open: boolean) => void
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "@",
    allowSpaces: false,

    items: ({ query }) => {
      const needle = query.trim().toLowerCase();
      return people
        .filter(
          (person) =>
            !needle ||
            person.fullName.toLowerCase().includes(needle) ||
            person.initials.toLowerCase().includes(needle)
        )
        .slice(0, 8);
    },

    render: () => {
      let element: HTMLDivElement | null = null;
      let items: ProfileRef[] = [];
      let selected = 0;
      let commandFn: ((attrs: { id: string; label: string }) => void) | null = null;

      function paint() {
        if (!element) return;
        element.replaceChildren();

        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.textContent = "No one by that name.";
          empty.className = "px-3 py-2 text-[12.5px] text-[var(--ink-faint)]";
          element.append(empty);
          return;
        }

        items.forEach((person, index) => {
          const option = document.createElement("button");
          option.type = "button";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(index === selected));
          option.dataset.index = String(index);
          option.className = [
            "flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px]",
            index === selected ? "bg-[var(--canvas)] text-[var(--ink)]" : "text-[var(--ink-muted)]",
          ].join(" ");

          // Hand-built DOM rather than `<PersonAvatar>`: tiptap's suggestion
          // renderer owns this node and there is no React tree to mount into.
          // Same structure as the component — initials underneath, picture on
          // top with an empty alt — so a missing or broken image falls back the
          // same way it does everywhere else.
          const badge = document.createElement("span");
          badge.className =
            "relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--hairline-strong)]";

          const mark = document.createElement("span");
          mark.textContent = person.initials;
          mark.className = "font-mono text-[9.5px] leading-none";
          badge.append(mark);

          if (person.avatarUrl) {
            const face = document.createElement("img");
            face.src = person.avatarUrl;
            face.alt = "";
            face.loading = "lazy";
            face.className = "absolute inset-0 size-full object-cover";
            badge.append(face);
          }

          const name = document.createElement("span");
          name.textContent = person.fullName;

          option.append(badge, name);
          option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            pick(index);
          });
          element!.append(option);
        });
      }

      function pick(index: number) {
        const person = items[index];
        if (person && commandFn) commandFn({ id: person.id, label: person.fullName });
      }

      function place(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!element || !clientRect) return;
        const rect = clientRect();
        if (!rect) return;
        element.style.top = `${rect.bottom + window.scrollY + 6}px`;
        element.style.left = `${rect.left + window.scrollX}px`;
      }

      return {
        onStart: (props) => {
          items = props.items as ProfileRef[];
          selected = 0;
          commandFn = props.command as typeof commandFn;

          element = document.createElement("div");
          element.setAttribute("role", "listbox");
          element.setAttribute("aria-label", "Mention someone");
          element.className =
            "fixed z-[90] w-[240px] overflow-hidden rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] py-1";
          element.style.position = "absolute";
          element.style.boxShadow = "var(--shadow-overlay)";
          document.body.append(element);

          paint();
          place(props.clientRect);
          onOpenChange?.(true);
        },

        onUpdate: (props) => {
          items = props.items as ProfileRef[];
          selected = Math.min(selected, Math.max(items.length - 1, 0));
          commandFn = props.command as typeof commandFn;
          paint();
          place(props.clientRect);
        },

        onKeyDown: (props) => {
          if (props.event.key === "ArrowDown") {
            selected = (selected + 1) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (props.event.key === "ArrowUp") {
            selected = (selected - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            paint();
            return true;
          }
          if (props.event.key === "Enter" || props.event.key === "Tab") {
            pick(selected);
            return true;
          }
          if (props.event.key === "Escape") {
            // Dismiss the list, but do NOT let the key travel on and close the
            // whole modal — the reader meant "not this list".
            props.event.stopPropagation();
            element?.remove();
            element = null;
            onOpenChange?.(false);
            return true;
          }
          return false;
        },

        onExit: () => {
          element?.remove();
          element = null;
          onOpenChange?.(false);
        },
      };
    },
  };
}
