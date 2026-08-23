"use client";

import { useEffect } from "react";

/**
 * The number on the app icon.
 *
 * Renders nothing. It reads the unread count the shell already fetched —
 * `countUnreadNotifications()`, the same number the dot on My work is drawn
 * from — and puts it on the installed app's icon, so a phone in a pocket says
 * how much is waiting without being opened.
 *
 * Feature-detected because `setAppBadge` does not exist everywhere: it is
 * Chromium and installed-PWA territory, absent in Firefox and, on iOS, present
 * only for a web app added to the Home Screen. A missing API is the normal
 * case, not an error, so nothing is logged and nothing is shown.
 *
 * `clearAppBadge` on zero rather than `setAppBadge(0)`: the second is specified
 * to show a badge with no number on some platforms, which would leave a dot on
 * the icon of an app with nothing waiting.
 */
export function AppBadge({ unreadCount }: { unreadCount: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (unreadCount > 0) {
      // Rejections are swallowed on purpose: the badge is refused outright in a
      // browser tab on some platforms, and that is a state, not a fault.
      void nav.setAppBadge?.(unreadCount).catch(() => undefined);
    } else {
      void nav.clearAppBadge?.().catch(() => undefined);
    }
  }, [unreadCount]);

  return null;
}
