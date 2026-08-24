"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { AlertTriangle } from "lucide-react";

/**
 * The picture you just pasted, before it exists anywhere but in your browser.
 *
 * ## Why a node and not a spinner in the toolbar
 *
 * There *was* a spinner in the toolbar — a small `uploading…` in the corner —
 * and it was wrong in three ways at once. It did not say **which** image, so
 * pasting two told you nothing. It did not say **how far**, so an 8MB
 * screenshot on a bad connection looked identical to a hang. And it put the
 * feedback somewhere other than where the thing was going to appear, so the
 * document sat empty and the obvious conclusion was that the paste had missed.
 *
 * This is the picture itself, in the place it will occupy, dimmed, with the
 * progress drawn over it. Nothing about the layout moves when it resolves: the
 * placeholder is already the right shape, because it is the same file.
 *
 * ## Why it can never be stored
 *
 * `previewUrl` is a `blob:` URL that exists only in this tab. If one reached
 * `body_json` it would render as a broken image for everybody including its
 * author on their next reload — the same class of bug as the expiring signed
 * URL this whole workstream is about.
 *
 * Three things stop it. `parseHTML` returns nothing, so it can never come back
 * off the clipboard or out of stored content. `renderHTML` emits an empty
 * `div`, so even a document serialised by mistake carries no URL. And the
 * composer refuses to submit while `hasPendingUpload` is true, with a sentence
 * rather than a silent strip — because silently dropping somebody's screenshot
 * is worse than making them wait two seconds for it.
 */

export const UPLOADING_IMAGE = "uploadingImage";

export interface UploadingAttrs {
  uploadId: string;
  previewUrl: string | null;
  fileName: string;
  progress: number;
  /** Set for the moment between a failure and the node being removed. */
  error: string | null;
  /** From the file itself, so the box is the right shape from the first frame. */
  width: number | null;
  height: number | null;
}

export const UploadingImage = Node.create({
  name: UPLOADING_IMAGE,
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      uploadId: { default: "" },
      previewUrl: { default: null },
      fileName: { default: "" },
      progress: { default: 0 },
      error: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  // Never parsed back in. This node is a state of this tab, not content.
  parseHTML() {
    return [];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-uploading-image": "" }, { class: HTMLAttributes.class })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(UploadingImageView);
  },
});

function UploadingImageView({ node }: NodeViewProps) {
  const attrs = node.attrs as UploadingAttrs;
  const percent = Math.max(0, Math.min(100, Number(attrs.progress) || 0));
  const failed = Boolean(attrs.error);

  // The same clamp the finished thumbnail uses, so the picture does not resize
  // when the upload lands. The aspect ratio comes from the file, when the
  // browser could read it; without one the box is square and the image is
  // letterboxed inside it, which is still stable.
  const aspect =
    attrs.width && attrs.height ? `${attrs.width} / ${attrs.height}` : undefined;

  return (
    <NodeViewWrapper
      as="div"
      className="my-1 inline-flex align-top"
      data-uploading-image=""
      data-progress={percent}
    >
      <div
        className="relative overflow-hidden rounded-inner border border-[var(--hairline)] bg-[var(--canvas)]"
        style={{ height: "clamp(88px, 22vw, 132px)", aspectRatio: aspect }}
      >
        {attrs.previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={attrs.previewUrl}
            alt=""
            aria-hidden
            className="block h-full w-auto max-w-full object-cover opacity-40"
          />
        ) : (
          <div className="h-full w-[132px]" />
        )}

        {/* The scrim, so the progress reads against a photograph as well as
            against a screenshot of white SCSS. */}
        <div className="absolute inset-0 bg-[var(--canvas)]/45" aria-hidden />

        {failed ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
            <AlertTriangle size={14} strokeWidth={2} className="text-[var(--rose)]" aria-hidden />
            <span className="font-mono text-[10px] leading-tight text-[var(--rose)]">
              did not upload
            </span>
          </span>
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-[6px] px-2">
            {/* A determinate bar rather than a spinner: "it is working" is not
                the question after ten seconds — "how much longer" is. */}
            <span
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                attrs.fileName ? `Uploading ${attrs.fileName}` : "Uploading an image"
              }
              className="h-[4px] w-[72%] max-w-[96px] overflow-hidden rounded-full bg-[var(--hairline-strong)]"
            >
              <span
                className="signal-gradient block h-full rounded-full transition-[width] duration-[var(--dur-micro)] motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
              {percent}%
            </span>
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** True when a document still holds an image that has not landed yet. */
export function hasPendingUpload(doc: unknown, depth = 0): boolean {
  if (depth > 24 || !doc || typeof doc !== "object") return false;
  const node = doc as { type?: string; content?: unknown[] };
  if (node.type === UPLOADING_IMAGE) return true;
  return (node.content ?? []).some((child) => hasPendingUpload(child, depth + 1));
}
