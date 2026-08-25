"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, ImagePlus, Link2, List, SquareCode, Type } from "lucide-react";

import { UPLOADING_IMAGE, UploadingImage } from "@/components/app/uploading-image.client";
import { Mono } from "@/components/coditu/mono";
import { uploadImage } from "@/lib/upload-image";
import { IMAGE_ACCEPT } from "@/lib/images";
import type { ProfileRef } from "@/lib/data/profiles";
import { CODE_LANGUAGES } from "@/lib/blocks/schema";
import { normaliseHref } from "@/lib/links";
import { cn } from "@/lib/utils";

import { buildMentionSuggestion } from "./mention-suggestion";

const lowlight = createLowlight(common);

/**
 * One rich-text editor, used in two places.
 *
 * The comment composer and the acceptance-criteria list need exactly the same
 * thing — formatting, code, links, mentions, pasted screenshots — and the
 * criteria list needed it second. Copying `comment-editor.client.tsx` would
 * have made two files that drift, and the security-relevant half of this (what
 * gets pasted, what gets uploaded, what gets stored) is the half you least want
 * two copies of. So it is extracted, and `comment-editor.client.tsx` is now a
 * thin configuration of it whose behaviour must not change by one pixel —
 * `e2e/comments.spec.ts`, `e2e/composer.spec.ts` and
 * `tests/comment-rendering.test.ts` are the proof, and they pass untouched.
 *
 * Still dynamically imported by both callers. TipTap and ProseMirror are most
 * of a route's budget and a thread you are only reading must never pay for
 * them.
 */

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

export interface RichTextEditorProps {
  initialDoc: unknown;
  onChange: (doc: unknown, isEmpty: boolean) => void;
  onSubmit: () => void;
  onEscape: () => void;
  onToast: (message: string) => void;
  autoFocus: boolean;
  placeholder: string;
  ariaLabel: string;
  /** The mention list. Omitted where mentions make no sense. */
  people?: ProfileRef[];
  /** Whether images may be pasted, dropped and picked. */
  images?: boolean;
  /** The item an uploaded image belongs to, so `attachments` can record it. */
  workItemId?: string;
  /** A criterion is usually one line; a comment expects a paragraph. */
  minHeight?: number;
  /** `compact` tightens the toolbar and shortens the surface for a criterion. */
  density?: "comfortable" | "compact";
  /** How many images one paste may carry. From `app_settings`, never a const. */
  maxBatch?: number;
}

export function RichTextEditor({
  initialDoc,
  onChange,
  onSubmit,
  onEscape,
  onToast,
  autoFocus,
  placeholder,
  ariaLabel,
  people = [],
  images = false,
  workItemId,
  minHeight = 72,
  density = "comfortable",
  maxBatch = 6,
}: RichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [describing, setDescribing] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  /** Every upload still in flight, so unmounting can stop them. */
  const inFlight = useRef(new Map<string, () => void>());
  /** Object URLs handed to placeholders, revoked when they are done with. */
  const previews = useRef(new Set<string>());

  const compact = density === "compact";

  /**
   * Find a placeholder by its id and do something with it.
   *
   * By id rather than by position, because between the paste and the response
   * the person carried on typing and every position moved. A position captured
   * at insert time resolves to the middle of a sentence by the time an 8MB
   * upload lands.
   */
  const withPlaceholder = useCallback(
    (editor: Editor, uploadId: string, act: (position: number, size: number) => void) => {
      // A plain object rather than a local, so TypeScript does not narrow it to
      // `never` after the callback that assigns it.
      const found: { at: number; size: number } = { at: -1, size: 0 };
      editor.state.doc.descendants((node, position) => {
        if (found.at !== -1) return false;
        if (node.type.name === UPLOADING_IMAGE && node.attrs.uploadId === uploadId) {
          found.at = position;
          found.size = node.nodeSize;
          return false;
        }
        return true;
      });
      if (found.at !== -1) act(found.at, found.size);
    },
    []
  );

  const releasePreview = useCallback((url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  }, []);

  /**
   * Paste a picture in, watch it fill, and either see it or hear why not.
   *
   * The placeholder goes in FIRST, at the caret, carrying a local preview of the
   * file — so the picture is on screen the instant it is pasted and the
   * document's shape stops changing after that. Progress is written onto the
   * node as it goes.
   *
   * On success the placeholder is replaced by a real image node carrying the
   * stable `/api/attachments/…` path and the intrinsic size the server read out
   * of the file's own header.
   *
   * On failure it is **removed entirely** — no broken image, no orphan
   * placeholder, no half-uploaded reference left in the draft for the next
   * session to load — and the reason is said out loud.
   */
  const startUpload = useCallback(
    async (file: File, editor: Editor) => {
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);
      previews.current.add(previewUrl);

      // The browser can read the file's own dimensions before a byte is sent,
      // which is what makes the placeholder the right shape from the first
      // frame — the picture does not resize when it lands.
      let size: { width: number; height: number } | null = null;
      try {
        const bitmap = await createImageBitmap(file);
        size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } catch {
        // A format this browser cannot decode. The box is square, the upload
        // still runs, and the server's own reading of the header wins in the
        // end anyway.
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: UPLOADING_IMAGE,
          attrs: {
            uploadId,
            previewUrl,
            fileName: file.name,
            progress: 0,
            error: null,
            width: size?.width ?? null,
            height: size?.height ?? null,
          },
        })
        .run();

      const handle = uploadImage(file, {
        workItemId,
        onProgress: (percent) => {
          // The abort on unmount stops the request, but a progress event
          // already in flight can still land — and dispatching into a
          // destroyed view throws where nobody is listening for it.
          if (editor.isDestroyed) return;
          withPlaceholder(editor, uploadId, (position) => {
            // `setNodeMarkup` rather than a command chain: this fires a dozen
            // times a second and must not touch the selection, or the caret
            // jumps to the picture every time the bar moves.
            const transaction = editor.state.tr.setNodeAttribute(position, "progress", percent);
            transaction.setMeta("addToHistory", false);
            editor.view.dispatch(transaction);
          });
        },
      });
      inFlight.current.set(uploadId, handle.abort);

      const result = await handle.result;
      inFlight.current.delete(uploadId);

      if (!editor.isDestroyed) {
        withPlaceholder(editor, uploadId, (position, nodeSize) => {
          if (result.ok) {
            editor.view.dispatch(
              editor.state.tr.replaceWith(
                position,
                position + nodeSize,
                editor.schema.nodes.image.create({
                  src: result.src,
                  alt: result.alt,
                  // Explicit dimensions, so the thread reserves the box before
                  // the bytes arrive. A thread that jumps while you are reading
                  // it is the worst version of this feature.
                  width: result.width ?? size?.width ?? null,
                  height: result.height ?? size?.height ?? null,
                })
              )
            );
          } else {
            editor.view.dispatch(editor.state.tr.delete(position, position + nodeSize));
          }
        });
      }

      releasePreview(previewUrl);
      if (!result.ok && !result.aborted) toastRef.current(result.error);
    },
    [releasePreview, withPlaceholder, workItemId]
  );

  /**
   * Several at once.
   *
   * `files.find(...)` used to take the first image and drop the rest silently,
   * which is exactly what happens when somebody selects four screenshots. They
   * go in order, one after another rather than all at once — four parallel 8MB
   * uploads on one connection finish no sooner and each one's progress bar
   * lies about the others.
   */
  const uploadAll = useCallback(
    async (files: File[], editor: Editor) => {
      const pictures = files.filter((file) => file.type.startsWith("image/"));
      if (pictures.length === 0) return;

      const batch = pictures.slice(0, maxBatch);
      if (pictures.length > batch.length) {
        toastRef.current(
          `${batch.length} of ${pictures.length} images — that is the limit per paste. Paste the rest after these land.`
        );
      }
      for (const file of batch) await startUpload(file, editor);
    },
    [maxBatch, startUpload]
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
        linkOnPaste: true,
        // The renderer re-checks every href anyway; this stops the obvious ones
        // from ever being stored.
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noreferrer nofollow ugc", target: "_blank" },
      }),
      // `width` and `height` are added to the node so the stored document can
      // carry the intrinsic size. The renderer tolerates their absence — every
      // image posted before 2026-08-25 has none.
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
          };
        },
      }).configure({ allowBase64: false }),
      UploadingImage,
      Mention.configure({
        HTMLAttributes: { class: "coditu-mention" },
        // The stored node keeps the profile UUID, never the display name, so a
        // rename cannot break a historical mention.
        renderText: ({ node }) => `@${node.attrs.label ?? "someone"}`,
        suggestion: buildMentionSuggestion(people),
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: (initialDoc as never) ?? undefined,
    editorProps: {
      attributes: {
        class: "coditu-prose outline-none",
        style: `min-height:${minHeight}px`,
        // `contenteditable` on a div is a GENERIC element as far as axe is
        // concerned, and `aria-label` on a generic element is prohibited — so
        // the name this editor has always carried was a violation waiting for
        // somebody to audit it while it was empty. (With text in it the rule
        // does not fire, which is why the composer's own audit has been green:
        // it types first.) `textbox` is the role a rich-text surface actually
        // has, and it is what makes the label legitimate.
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
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
      /**
       * Paste, and the two things it has to get right.
       *
       * Files first: a screenshot on the clipboard arrives as `files`, and
       * several of them arrive as several.
       *
       * Then the HTML. A fragment from Word, Notion or Google Docs carries node
       * types this app does not render — tables, spans full of inline styles,
       * `<o:p>` — and while `comment-body.tsx` fails closed on all of them, the
       * *stored* document should be clean rather than merely harmless. Anything
       * outside the allowlist is stripped on the way in.
       */
      handlePaste(view, event) {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.some((file) => file.type.startsWith("image/"))) {
          if (!images) return false;
          event.preventDefault();
          if (editorRef.current) void uploadAll(files, editorRef.current);
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (!files.some((file) => file.type.startsWith("image/"))) return false;
        if (!images) return false;
        event.preventDefault();
        if (editorRef.current) void uploadAll(files, editorRef.current);
        return true;
      },
      transformPastedHTML(html) {
        return stripToAllowlist(html);
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(toPlainObject(instance.getJSON()), instance.isEmpty);
    },
  });

  /**
   * The toolbar's own state, subscribed to rather than read once.
   *
   * TipTap v3 stopped re-rendering the component on every transaction —
   * `shouldRerenderOnTransaction` defaults to false and its own types call it
   * "legacy behavior that will be removed". So `editor.isActive("bold")` read
   * straight in the render body is evaluated once, at mount, and never again:
   * every button in this toolbar was frozen at "off" for the life of the
   * editor, and `aria-pressed` told a screen reader the same lie.
   *
   * It looked fine, because pressing Bold still *worked* — the command ran and
   * the text came out bold. Only the indicator was dead, which is why nothing
   * caught it until `e2e/mobile.spec.ts` asserted `aria-pressed` on an empty
   * composer, where the indicator is the only feedback there is.
   *
   * `useEditorState` re-renders only when one of these values actually changes,
   * which is the point of it — a keystroke that changes no flag costs nothing.
   */
  const toolbar = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      // Stored marks included: `isActive` consults them, so the button lights
      // up on an empty document before there is anything to select. That is
      // the behaviour A3 asks for and the reason this is not just cosmetic.
      bold: instance?.isActive("bold") ?? false,
      italic: instance?.isActive("italic") ?? false,
      code: instance?.isActive("code") ?? false,
      codeBlock: instance?.isActive("codeBlock") ?? false,
      bulletList: instance?.isActive("bulletList") ?? false,
      link: instance?.isActive("link") ?? false,
      image: instance?.isActive("image") ?? false,
      language: (instance?.getAttributes("codeBlock").language as string | undefined) ?? "ts",
    }),
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    editor.commands.focus("end");

    /**
     * …and then make sure it is somewhere a thumb can reach.
     *
     * The app's top bar is `position: sticky`, and a browser scrolling a
     * newly-focused element into view has no idea it is there — the element is
     * "visible" by the browser's reckoning while being covered by 53 of its 74
     * pixels. Measured on an iPhone, opening a criterion editor left a 21px
     * strip of a 74px surface actually tappable, with the caret behind the
     * header. `axe` reports it exactly right: "target-size … partially
     * obscured", which is the one accessibility failure in this suite that is
     * also a plain usability failure.
     *
     * `block: "nearest"` rather than `"start"`, because B5 asks that opening
     * the editor does not scroll the sheet to the top. Combined with the
     * `scroll-margin-top` on `.coditu-prose`, "nearest" means *do nothing if it
     * is genuinely clear, and otherwise move it down by exactly the height of
     * the thing in the way*.
     */
    editor.view.dom.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [editor, autoFocus]);

  // Leaving with an upload in flight cancels it and releases its preview. An
  // abandoned `blob:` URL is a leak that lives as long as the tab, and an XHR
  // nobody is listening to is a placeholder that will never be resolved.
  useEffect(() => {
    const running = inFlight.current;
    const urls = previews.current;
    return () => {
      for (const abort of running.values()) abort();
      for (const url of urls) URL.revokeObjectURL(url);
      running.clear();
      urls.clear();
    };
  }, []);

  const openLink = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  }, []);

  /**
   * ⌘K opens the link box — and it has to win.
   *
   * `topbar.client.tsx` binds ⌘K on `window` for the command palette, and it
   * fires while the palette is closed, which is the point of it. Two handlers,
   * one chord. This one runs in the **capture** phase on the editor's own
   * wrapper, so it only ever sees the event while focus is in here, and it
   * stops the event there — the same rule `comment-image.client.tsx` follows
   * for Escape. Both shortcuts keep working; they simply never both fire.
   */
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      event.stopPropagation();
      openLink();
    }
    node.addEventListener("keydown", onKeyDown, true);
    return () => node.removeEventListener("keydown", onKeyDown, true);
  }, [openLink]);

  // `toolbar` is null for exactly as long as `editor` is — `useEditorState`
  // has nothing to select from until the instance exists. One guard for both,
  // so the box below is the single "not ready yet" state.
  if (!editor || !toolbar) {
    return (
      <div
        className="rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-3"
        style={{ minHeight: minHeight + 40 }}
      >
        <Mono size="meta" className="text-[var(--ink-faint)]">
          loading the editor…
        </Mono>
      </div>
    );
  }

  const isCodeBlock = toolbar.codeBlock;
  const imageSelected = toolbar.image;

  return (
    <div
      ref={wrapperRef}
      className="rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)]"
    >
      {/* The toolbar scrolls sideways rather than wrapping to a second row: at
          320px a wrapped toolbar is two rows of buttons above a two-line
          composer, and the thing being written disappears under the keyboard.
          `overscroll-contain` so flicking it does not scroll the sheet behind. */}
      <div
        className={cn(
          "relative flex flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--hairline)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          compact ? "px-1 py-[3px]" : "px-2 py-[6px]"
        )}
      >
        <ToolbarButton label="Bold" active={toolbar.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={toolbar.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={toolbar.code} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Code block" active={isCodeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <SquareCode size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={toolbar.link}
          onClick={() => {
            if (linkOpen) {
              setLinkOpen(false);
              return;
            }
            openLink();
          }}
        >
          <Link2 size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Bullet list" active={toolbar.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} strokeWidth={2.2} aria-hidden />
        </ToolbarButton>
        {images ? (
          <ToolbarButton label="Image" active={false} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={14} strokeWidth={2.2} aria-hidden />
          </ToolbarButton>
        ) : null}

        {/* Alt text, for the one image that is selected.
            Today it is the filename — honest, and poor. A screen reader user is
            why, and `axe` will not catch this one: a filename IS an alt text as
            far as any automated check is concerned. */}
        {imageSelected ? (
          <ToolbarButton
            label="Describe this image"
            active={describing}
            onClick={() => {
              setAltDraft((editor.getAttributes("image").alt as string | undefined) ?? "");
              setDescribing((was) => !was);
            }}
          >
            <Type size={14} strokeWidth={2.2} aria-hidden />
          </ToolbarButton>
        ) : null}

        {isCodeBlock ? (
          <label className="ml-1 flex shrink-0 items-center gap-1">
            <span className="sr-only">Code language</span>
            <select
              value={toolbar.language}
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

        {linkOpen ? (
          <LinkPopover
            value={linkDraft}
            canRemove={toolbar.link}
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

        {describing ? (
          <AltPopover
            value={altDraft}
            onChange={setAltDraft}
            onCancel={() => {
              setDescribing(false);
              editor.chain().focus().run();
            }}
            onApply={() => {
              setDescribing(false);
              editor.chain().focus().updateAttributes("image", { alt: altDraft.trim() }).run();
            }}
          />
        ) : null}

        {images ? (
          /* The visible "Image" button is the real control; this is the
             mechanism behind it. It stays named in case a reader lands on it,
             and out of the tab order so it is not a second stop for the same
             action. `aria-hidden` is not an option — hiding a focusable element
             is its own violation. */
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            aria-label="Attach an image"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              if (files.length && editor) void uploadAll(files, editor);
              event.target.value = "";
            }}
          />
        ) : null}
      </div>

      <div className={compact ? "px-2 py-[6px]" : "px-3 py-2"}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/**
 * What a paste from Word, Notion or Google Docs is allowed to bring with it.
 *
 * `comment-body.tsx` already fails closed on anything outside the allowlist, so
 * nothing here is a security fix — it is a cleanliness one. A document that
 * *stores* forty `<span style="mso-…">` wrappers renders correctly today and is
 * a nightmare the first time somebody has to read the JSON, and the flattened
 * `body_text` the exports use gets the whitespace those wrappers carried.
 *
 * A tag that is not one of ours is unwrapped, not deleted: the words inside it
 * are what the person meant to paste.
 */
const PASTE_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "S", "STRIKE", "DEL", "CODE", "PRE",
  "UL", "OL", "LI", "BLOCKQUOTE", "HR", "A", "IMG", "H3", "H4",
]);

function stripToAllowlist(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");

  parsed.body.querySelectorAll("script,style,meta,link,iframe,object,embed").forEach((node) => node.remove());

  // Depth-first, so unwrapping a parent does not skip the children it exposed.
  const walk = (node: Element) => {
    [...node.children].forEach(walk);
    if (!PASTE_TAGS.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    // Inline styles and classes carry a foreign design system into a document
    // that has its own. Everything but `href`, `src` and `alt` goes.
    for (const attribute of [...node.attributes]) {
      if (!["href", "src", "alt"].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
  };
  [...parsed.body.children].forEach(walk);

  return parsed.body.innerHTML;
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
    <Popover label="Link" onCancel={onCancel}>
      <input
        autoFocus
        type="url"
        inputMode="url"
        // The popover is labelled; this field was not. A placeholder is not an
        // accessible name — it disappears the moment you type and screen
        // readers are not required to announce it — so anyone arriving here
        // without sight of the popover heading got an unnamed text box in the
        // middle of a comment. `axe` does not flag it, because the field is
        // inside a labelled group and the rule only looks for *a* name in
        // scope; `e2e/editor.spec.ts` asks for this one by name, which is what
        // caught it.
        aria-label="Link"
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
    </Popover>
  );
}

/** The same box, for the description of the selected image. */
function AltPopover({
  value,
  onChange,
  onApply,
  onCancel,
}: {
  value: string;
  onChange: (next: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <Popover label="Describe this image" onCancel={onCancel}>
      <input
        autoFocus
        value={value}
        maxLength={200}
        placeholder="The settings panel with the toggle at the top"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
        className="h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]"
      />
      <div className="flex items-center gap-2">
        <Mono size="meta" className="text-[var(--ink-faint)]">
          the filename is the default
        </Mono>
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
    </Popover>
  );
}

function Popover({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: React.ReactNode;
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
      <Mono size="eyebrow" className="text-[var(--ink-faint)]">
        {label}
      </Mono>
      {children}
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
      // Preventing `mousedown` — and NOT `pointerdown`. The pointer event looks
      // like the more thorough guard and is the one that cannot be used here:
      //
      //   tap on mobile-chrome  -> pointerdown, touchstart, click
      //   tap on mobile-safari  -> pointerdown, touchstart          (no click)
      //
      // Measured, both engines, in `e2e/mobile.spec.ts`. WebKit treats a
      // default-prevented `pointerdown` as cancelling the whole activation, so
      // the click never arrives and the button does nothing at all on an
      // iPhone — a worse bug than the one the guard was added for, and silent,
      // because every desktop browser still worked.
      //
      // `mousedown` is the idiom that actually holds: preventing it keeps focus
      // in the editor, and `click` still fires on every engine. On a touch
      // screen focus does leave — nothing can stop that portably — but the
      // command chain below re-focuses and then toggles, so the stored mark is
      // set fresh *after* the caret is back, which is the state an empty
      // document needs. `touch-action: manipulation` stops the double-tap-zoom
      // delay that makes a toolbar feel broken.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{ touchAction: "manipulation" }}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-chip text-[var(--ink-muted)] hover:bg-[var(--canvas)]",
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
