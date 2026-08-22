/**
 * Is this page running as an installed app, rather than in a browser tab?
 *
 * It matters more than it sounds. **iOS grants Web Push only to a web app
 * installed to the Home Screen** — a Safari tab gets nothing, ever, and
 * `Notification.requestPermission()` there does not fail, it simply does
 * nothing. Showing a button that cannot work is worse than showing a sentence
 * explaining Add to Home Screen, so workstream F asks this before it decides
 * which of the two to render.
 *
 * Two checks, because the platforms disagree:
 *
 *  - `display-mode: standalone` is the standard, and it is what Android and
 *    desktop Chrome answer to. It matches the `display` in the manifest, which
 *    is why the manifest declares `standalone` and lists `minimal-ui` only as a
 *    fallback in `display_override`.
 *  - `navigator.standalone` is Apple's, predates the media query by years, and
 *    is still the only reliable answer on an installed iOS web app. It is not
 *    in the DOM typings, hence the cast.
 *
 * Callable during render is deliberately NOT the intent: it touches `window`,
 * so it returns `false` on the server and must be read from an effect, or the
 * markup will not match what the client computes.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  const displayMode =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      // An installed app whose manifest fell back to `minimal-ui` is still
      // installed, and still gets the Home Screen's push permission on iOS.
      window.matchMedia("(display-mode: minimal-ui)").matches);

  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return displayMode || iosStandalone;
}

/**
 * Is this an iPhone or iPad?
 *
 * User-agent sniffing, which is normally the wrong answer — used here because
 * the thing being detected is a **platform policy**, not a feature. There is no
 * capability to test for: iOS Safari in a tab exposes `Notification` and
 * `serviceWorker` exactly as an installed app does, and only tells you the
 * difference by silently refusing the prompt.
 *
 * iPadOS reports itself as a Mac, so the touch-point count is what separates a
 * real iPad from a MacBook.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
}
