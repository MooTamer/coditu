/**
 * Uploading one image from the browser, with progress.
 *
 * ## Why `XMLHttpRequest` in 2026
 *
 * Because it is the only thing that reports **upload** progress. `fetch` reports
 * download progress and nothing else, and a Server Action call is a `fetch`. On
 * a fast connection nobody noticed; on a hotel wifi an 8MB screenshot was
 * thirty seconds of an editor that said `uploading…` and gave no sign it was
 * still alive — which is the exact moment a person pastes it again and ends up
 * with two.
 *
 * So the request goes to `/api/uploads` and the placeholder in the document
 * fills as the bytes go.
 *
 * ## What a caller gets back
 *
 * Never a thrown error. Every failure — offline, aborted, refused, a 500, a
 * body that is not JSON — comes back as `{ ok: false, error }` with a sentence
 * a person can act on, because the caller's job is to remove the placeholder
 * and say why, and a `try`/`catch` around three different failure shapes is how
 * one of them ends up saying "undefined".
 */

export interface UploadedImage {
  ok: true;
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface UploadFailure {
  ok: false;
  error: string;
  /** True when the caller cancelled it, so it can stay quiet about it. */
  aborted?: boolean;
}

export type UploadResult = UploadedImage | UploadFailure;

export interface UploadHandle {
  result: Promise<UploadResult>;
  /** Stop it. Used when the editor unmounts mid-upload. */
  abort: () => void;
}

export function uploadImage(
  file: File,
  options: {
    /** The item the image belongs to, so `attachments` can record it. */
    workItemId?: string;
    /** 0–100, called often. */
    onProgress?: (percent: number) => void;
  } = {}
): UploadHandle {
  // Checked before the request rather than after it fails: offline is the one
  // failure with a specific, useful sentence, and `navigator.onLine` is
  // reliable in the negative — false really does mean no network.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      result: Promise.resolve({
        ok: false,
        error: "No connection — check your network. Your draft is safe.",
      }),
      abort: () => {},
    };
  }

  const request = new XMLHttpRequest();
  const body = new FormData();
  body.append("file", file);
  if (options.workItemId) body.append("workItemId", options.workItemId);

  const result = new Promise<UploadResult>((resolve) => {
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      // Capped at 99 on purpose. The last percent belongs to the server
      // answering, and a bar that sits at 100 while nothing happens reads as a
      // hang — which is the thing this whole file exists to avoid.
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });

    request.addEventListener("load", () => {
      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      // Deliberately NOT `Partial<UploadedImage & UploadFailure>`: intersecting
      // `ok: true` with `ok: false` is `never`, and every field below then
      // resolves to nothing. The wire shape is its own type.
      const body = payload as {
        ok?: boolean;
        src?: string;
        alt?: string;
        width?: number | null;
        height?: number | null;
        error?: string;
      } | null;

      if (request.status >= 200 && request.status < 300 && body?.ok && body.src) {
        options.onProgress?.(100);
        resolve({
          ok: true,
          src: body.src,
          alt: body.alt ?? file.name,
          width: body.width ?? null,
          height: body.height ?? null,
        });
        return;
      }

      resolve({
        ok: false,
        error:
          body?.error ??
          (request.status === 0
            ? "That upload did not reach us. Check your connection and try again."
            : "That upload failed. Nothing was lost — try again."),
      });
    });

    request.addEventListener("error", () =>
      resolve({ ok: false, error: "That upload did not reach us. Check your connection." })
    );
    request.addEventListener("timeout", () =>
      resolve({ ok: false, error: "That upload timed out. A smaller image, or a better connection." })
    );
    request.addEventListener("abort", () =>
      resolve({ ok: false, error: "That upload was cancelled.", aborted: true })
    );
  });

  request.open("POST", "/api/uploads");
  // Long enough for 8MB on a bad connection, short enough that a wedged request
  // does not hold a placeholder in the document forever.
  request.timeout = 120_000;
  request.send(body);

  return { result, abort: () => request.abort() };
}
