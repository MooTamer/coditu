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
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--hairline)] px-2 py-[6px]">
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
            const previous = editor.getAttributes("link").href as string | undefined;
            const href = window.prompt("Link URL", previous ?? "https://");
            if (href === null) return;
            if (href === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href }).run();
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
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-chip text-[var(--ink-muted)] hover:bg-[var(--canvas)]",
        active && "bg-[var(--canvas)] text-[var(--ink)]"
      )}
    >
      {children}
    </button>
  );
}
