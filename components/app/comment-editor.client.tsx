"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, ImagePlus, Link2, List, SquareCode } from "lucide-react";

import { Mono } from "@/components/coditu/mono";
import { uploadCommentImage } from "@/lib/actions/comments";
import { IMAGE_ACCEPT } from "@/lib/images";
import type { ProfileRef } from "@/lib/data/profiles";
import { CODE_LANGUAGES } from "@/lib/comments/schema";
import { cn } from "@/lib/utils";

import { buildMentionSuggestion } from "./mention-suggestion";

const lowlight = createLowlight(common);

/**
 * Deep-clones a ProseMirror document into ordinary objects.
 *
 * ProseMirror builds each node's `attrs` with `Object.create(null)`, and React's
 * Server Action serializer only handles objects that inherit from
 * `Object.prototype`. A null-prototype object is dropped SILENTLY — no error,
 * no warning: the mention arrives at the server as `{"type":"mention"}` with
 * its profile id gone, so the mention row and its notification are never
 * created and the chip renders as "@someone".
 *
 * `JSON.parse(JSON.stringify(...))` is the whole fix: stringify reads
 * null-prototype objects happily, and parse hands back plain ones.
 */
function toPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The TipTap editor.
 *
 * This module is the reason the composer is dynamically imported: TipTap and
 * ProseMirror are a large dependency, and a thread you are only reading must
 * never pay for them. Nothing here is loaded until somebody focuses the
 * composer or has a saved draft.
 */
export interface CommentEditorHandle {
  editor: Editor | null;
}

export function CommentEditor({
  initialDoc,
  people,
  onChange,
  onSubmit,
  onEscape,
  onToast,
  autoFocus,
}: {
  initialDoc: unknown;
  people: ProfileRef[];
  onChange: (doc: unknown, isEmpty: boolean) => void;
  onSubmit: () => void;
  onEscape: () => void;
  onToast: (message: string) => void;
  autoFocus: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  const uploadFile = useCallback(
    async (file: File, editor: Editor) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await uploadCommentImage(form);
        if (result.ok && result.src) {
          editor.chain().focus().setImage({ src: result.src, alt: file.name }).run();
        } else {
          // No broken image left behind — the placeholder simply never appears
          // and the reason is said out loud.
          onToast(result.error ?? "That image did not upload.");
        }
      } finally {
        setUploading(false);
      }
    },
    [onToast]
  );

  const editor = useEditor({
    // Rendering on the server would produce markup React then has to reconcile
    // against ProseMirror's own DOM, which it does not own.
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        codeBlock: false,
        // ProseMirror's own history is what makes Cmd+Z work inside the editor.
        link: false,
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "ts" }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // The renderer re-checks every href anyway; this stops the obvious ones
        // from ever being stored.
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noreferrer nofollow ugc", target: "_blank" },
      }),
      Image.configure({ allowBase64: false }),
      Mention.configure({
        HTMLAttributes: { class: "coditu-mention" },
        // The stored node keeps the profile UUID, never the display name, so a
        // rename cannot break a historical mention.
        renderText: ({ node }) => `@${node.attrs.label ?? "someone"}`,
        suggestion: buildMentionSuggestion(people),
      }),
      Placeholder.configure({ placeholder: "Write a comment — @ to mention" }),
    ],
    content: (initialDoc as never) ?? undefined,
    editorProps: {
      attributes: {
        class: "coditu-prose min-h-[72px] outline-none",
        "aria-label": "Comment",
      },
      handleKeyDown(view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        if (event.key === "Escape") {
          // Blur without discarding. The draft is already in localStorage, so
          // Esc is "step away", not "throw it out".
          event.preventDefault();
          view.dom.blur();
          escapeRef.current();
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])];
        const image = files.find((file) => file.type.startsWith("image/"));
        if (!image || !editorRef.current) return false;
        event.preventDefault();
        void uploadFile(image, editorRef.current);
        return true;
      },
      handleDrop(view, event) {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        const image = files.find((file) => file.type.startsWith("image/"));
        if (!image || !editorRef.current) return false;
        event.preventDefault();
        void uploadFile(image, editorRef.current);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(toPlainObject(instance.getJSON()), instance.isEmpty);
    },
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editor && autoFocus) editor.commands.focus("end");
  }, [editor, autoFocus]);

  if (!editor) {
    return (
      <div className="min-h-[112px] rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    );
  }

  const isCodeBlock = editor.isActive("codeBlock");

  return (
    <div className="rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)]">
      <div className="relative flex flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-2 py-[6px]">
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Code block" active={isCodeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <SquareCode size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
            setLinkOpen((was) => !was);
          }}
        >
          <Link2 size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Image" active={false} onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>

        {isCodeBlock ? (
          <label className="ml-1 flex items-center gap-1">
            <span className="sr-only">Code language</span>
            <select
              value={(editor.getAttributes("codeBlock").language as string) ?? "ts"}
              onChange={(event) =>
                editor.chain().focus().updateAttributes("codeBlock", { language: event.target.value }).run()
              }
              className="rounded-chip border border-[var(--hairline)] bg-[var(--canvas)] px-[6px] py-[2px] font-mono text-[10.5px] text-[var(--ink-muted)]"
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {uploading ? (
          <Mono size="meta" className="ml-auto text-[var(--ink-faint)]" role="status" aria-live="polite">
            uploading…
          </Mono>
        ) : null}

        {/* The visible "Image" button is the real control; this is the
            mechanism behind it. It stays named in case a reader lands on it,
            and out of the tab order so it is not a second stop for the same
            action. `aria-hidden` is not an option — hiding a focusable element
            is its own violation. */}
        {linkOpen ? (
          <LinkPopover
            value={linkDraft}
            canRemove={editor.isActive("link")}
            onChange={setLinkDraft}
            onCancel={() => {
              setLinkOpen(false);
              editor.chain().focus().run();
            }}
            onRemove={() => {
              setLinkOpen(false);
              editor.chain().focus().unsetLink().run();
            }}
            onApply={() => {
              const href = normaliseHref(linkDraft);
              setLinkOpen(false);
              if (!href) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              // An empty selection would set a mark over nothing, so the URL
              // becomes the link text — which is what everybody means when they
              // press Link with no words selected.
              if (editor.state.selection.empty) {
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
                  .run();
              } else {
                editor.chain().focus().setLink({ href }).run();
              }
            }}
          />
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label="Attach an image to this comment"
          tabIndex={-1}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && editor) void uploadFile(file, editor);
            event.target.value = "";
          }}
        />
      </div>

      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * What somebody types into a link box, turned into something that can be one.
 *
 * "coditu.com" is what a person types and "https://coditu.com" is what a link
 * needs; a bare word is neither, and returning null for it means the editor
 * unsets the mark instead of storing a href that goes nowhere. `mailto:` and
 * the two http schemes are the only ones the renderer will draw anyway — see
 * `isSafeHref` — so anything else is left to be refused there rather than
 * quietly rewritten here.
 */
function normaliseHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value)) return `mailto:${value}`;
  // A single word with no dot is not a domain — it is somebody still typing.
  if (!/^[^\s/]+\.[^\s/]+/.test(value)) return null;
  return `https://${value}`;
}

/**
 * The link editor.
 *
 * It replaces `window.prompt`, which was doing the job and doing it badly: an
 * OS-chrome dialog in the middle of the screen, unstyled, untranslatable,
 * blocking the whole tab, and on a phone a full-screen system sheet that hides
 * the text you were linking. It also cannot show whether the selection already
 * has a link, so "remove this link" had to be spelled "clear the box".
 *
 * Anchored under the toolbar rather than portalled: it belongs to this editor,
 * it is small, and the composer is not inside a scroll container that would
 * clip it — the reason `CellPopover` needs a portal does not apply here.
 */
function LinkPopover({
  value,
  canRemove,
  onChange,
  onApply,
  onRemove,
  onCancel,
}: {
  value: string;
  canRemove: boolean;
  onChange: (next: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      // Full width on a phone, where 320px of popover on a 360px screen leaves
      // no margin; capped and left-aligned to the toolbar above that.
      className="absolute left-2 right-2 top-[calc(100%+4px)] z-[70] flex flex-col gap-2 rounded-inner border border-[var(--hairline-strong)] bg-[var(--overlay)] p-2 sm:right-auto sm:w-[320px]"
      style={{ boxShadow: "var(--shadow-overlay)" }}
      data-reveal="surface"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // The composer's own Escape blurs the editor; this one is only about
          // the popover, so it must not travel any further.
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="flex flex-col gap-[6px]">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          Link
        </Mono>
        <input
          autoFocus
          type="url"
          inputMode="url"
          value={value}
          placeholder="coditu.com"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onApply();
            }
          }}
          className="h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]"
        />
      </label>

      <div className="flex items-center gap-2">
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="h-[30px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto h-[30px] rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="signal-gradient h-[30px] rounded-control px-4 text-[12.5px] font-semibold text-[#07090E]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // The whole reason Bold worked on a selection and did nothing on an empty
      // line. Pressing a button moves focus out of the editor, which drops
      // ProseMirror's STORED MARKS — the "the next thing I type is bold" state
      // that an empty document has instead of a range to mark. `focus()` in the
      // command chain then put the caret back, with the stored mark already
      // gone, so the button looked dead until there were words to select.
      // Refusing the mousedown means focus never leaves.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-chip text-[var(--ink-muted)] hover:bg-[var(--canvas)]",
        // 28px is under WCAG 2.5.8's 24px minimum only in appearance: the row
        // is 34px tall and the buttons sit flush, so the target is the button
        // plus the padding around it. Kept as is, and asserted in a11y.spec.
        active && "bg-[var(--canvas)] text-[var(--ink)]"
      )}
    >
      {children}
    </button>
  );
}
