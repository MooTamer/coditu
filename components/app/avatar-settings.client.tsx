"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";

import { PersonAvatar, type AvatarPerson } from "@/components/app/person-avatar";
import { Mono } from "@/components/coditu/mono";
import { useToast } from "@/components/app/toast.client";
import { removeMyAvatar, setMyAvatar } from "@/lib/actions/profiles";
import { IMAGE_ACCEPT, isAllowedImageType } from "@/lib/images";

/** What the picture is stored and displayed at. Twice 40px, for a dense screen. */
const EDGE = 256;

/**
 * Your own picture: choose one, replace it, or take it away again.
 *
 * The optimistic state here is deliberately small. Invariant 4 says an
 * optimistic update needs a rollback path and a visible error, and the honest
 * cheap version of that for a file upload is a local `objectURL` shown while the
 * request is in flight: if the action fails it is revoked and the previous face
 * comes back with a sentence saying why. Nothing pretends to be saved before it
 * is — the caption says "uploading…" until the server answers.
 */
export function AvatarSettings({ me }: { me: AvatarPerson }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  /** A local preview of the file being uploaded. Null the rest of the time. */
  const [preview, setPreview] = useState<string | null>(null);

  const shown: AvatarPerson = preview ? { ...me, avatarUrl: preview } : me;

  function clearPreview(url: string | null) {
    if (url) URL.revokeObjectURL(url);
    setPreview(null);
  }

  async function choose(file: File) {
    if (!isAllowedImageType(file.type)) {
      toast("Pictures only — PNG, JPEG, WebP, GIF or AVIF.");
      return;
    }

    const upload = await downscale(file);
    const objectUrl = URL.createObjectURL(upload);
    setPreview(objectUrl);

    const form = new FormData();
    form.append("file", upload);

    startTransition(async () => {
      try {
        const result = await setMyAvatar(form);
        if (!result.ok) {
          clearPreview(objectUrl);
          toast(result.error ?? "That picture did not save.");
          return;
        }
        // The server tree now holds the real URL. Drop the local preview only
        // after the refresh, or the face flickers back to initials in between.
        router.refresh();
        setTimeout(() => clearPreview(objectUrl), 1200);
      } catch {
        // A Server Action that THROWS never returns a result, so the branch
        // above never runs and the preview would sit there looking saved.
        clearPreview(objectUrl);
        toast("That picture did not save. Nothing has changed — try again.");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        const result = await removeMyAvatar();
        if (!result.ok) {
          toast(result.error ?? "That did not save.");
          return;
        }
        router.refresh();
      } catch {
        toast("That did not save. Your picture is still there — try again.");
      }
    });
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-5">
      <PersonAvatar person={shown} size={72} fontSize={22} style={{ opacity: pending ? 0.6 : 1 }} />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="inline-flex h-[38px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-4 text-[13.5px] font-medium hover:bg-[var(--canvas)] disabled:opacity-60"
          >
            <ImagePlus size={14} strokeWidth={2} aria-hidden />
            {me.avatarUrl ? "Replace picture" : "Choose a picture"}
          </button>

          {me.avatarUrl ? (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="inline-flex h-[38px] items-center gap-2 rounded-control border border-[var(--hairline)] px-4 text-[13.5px] font-medium text-[var(--ink-muted)] hover:bg-[var(--canvas)] disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden />
              Remove
            </button>
          ) : null}
        </div>

        <Mono size="meta" aria-live="polite" className="text-[var(--ink-faint)]">
          {pending
            ? "uploading…"
            : me.avatarUrl
              ? `shown wherever you appear · square, ${EDGE}px`
              : `your initials (${me.initials}) are shown until you pick one`}
        </Mono>
      </div>

      {/* The visible buttons are the real controls; this is the file picker they
          open. `sr-only` rather than `hidden`, so it keeps a label. */}
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label="Choose a profile picture"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first: picking the same file twice fires no change event
          // otherwise, so a failed upload could not be retried with it.
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
    </div>
  );
}

/**
 * Square-crop and shrink to 256px in the browser, before anything is uploaded.
 *
 * A face appears on nearly every screen, several times over, so what gets
 * stored matters: a phone photograph is 3–5MB and would be downloaded in full
 * to draw a 20px circle on a board card. Re-encoded here it is about 20KB.
 *
 * `createImageBitmap` with `imageOrientation: "from-image"` applies the EXIF
 * rotation that a canvas would otherwise drop — without it, portrait photographs
 * from a phone arrive on their side. If any of this fails the original file is
 * returned unchanged and the server's 2MB cap decides; a browser that cannot
 * resize should not be a browser that cannot set a picture.
 */
async function downscale(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const edge = Math.min(bitmap.width, bitmap.height);

    const canvas = document.createElement("canvas");
    canvas.width = EDGE;
    canvas.height = EDGE;

    const context = canvas.getContext("2d");
    if (!context) return file;

    // Centre crop: the interesting part of a portrait is the middle, and a
    // squashed face is worse than a cropped one.
    context.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      EDGE,
      EDGE
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9)
    );
    if (!blob) return file;

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } catch {
    return file;
  }
}
