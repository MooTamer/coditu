import type { Metadata, Viewport } from "next";

import { CoditusMarkDefs } from "@/components/coditu/coditus-mark";
import { ThemeProvider } from "@/components/theme-provider";
import { fontVariables } from "@/lib/fonts";
import { marketingContent } from "@/lib/marketing-content";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: marketingContent.siteMeta.defaultTitle,
    template: marketingContent.siteMeta.titleTemplate,
  },
  description: marketingContent.siteMeta.description,
  applicationName: marketingContent.siteMeta.siteName,
  // Every one of these is rendered from `public/brand/` by
  // `npm run brand:assets`. Nothing here is hand-exported.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/mark.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  // Matches `--canvas` in each theme, so the mobile browser chrome does not
  // sit against a colour the page never uses.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ebeff6" },
    { media: "(prefers-color-scheme: dark)", color: "#07090e" },
  ],

  /**
   * **Without this, every `env(safe-area-inset-*)` in this codebase resolves to
   * zero.**
   *
   * The rail, the topbar, the dialog shell and the marketing menu sheet all
   * already pad themselves against the notch and the home indicator, and every
   * one of those lines had never once taken effect: `viewport-fit` defaults to
   * `auto`, the page is laid out inside the safe area, and the insets are 0 by
   * definition. So the code looked correct, reviewed as correct, and did
   * nothing — which is the exact failure mode this repository keeps writing
   * things down about.
   *
   * `cover` puts the layout under the rounded corners and the notch, and the
   * insets become real numbers that those `max()` calls can use.
   */
  viewportFit: "cover",

  /**
   * The on-screen keyboard RESIZES the layout viewport instead of sliding it.
   *
   * The default (`resizes-visual`) leaves `100dvh` at the full screen height
   * with the keyboard covering the bottom third of it — and the bottom is where
   * a dialog's action bar and the mobile navigation live. Nothing in the app is
   * anchored to `window.innerHeight` in JavaScript, so the resize costs nothing
   * and fixes the case where the Save button is behind the keyboard.
   */
  interactiveWidget: "resizes-content",

  // Deliberately NO `maximumScale` and NO `userScalable: false`. `e2e/a11y.spec.ts`
  // asserts there is no horizontal overflow at 200% zoom, and that assertion is
  // protecting a real requirement rather than a preference — WCAG 1.4.4. A
  // viewport that cannot be zoomed is a viewport somebody cannot read.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-clip">
      <body className={`${fontVariables} min-w-0 overflow-x-clip font-sans antialiased`}>
        {/* Light is the default the team asked for and the one `:root`
            declares, so a document with no stored choice paints correctly on
            the very first frame. Dark is the alternate. System preference is
            still not consulted — see docs/05-DECISIONS.md. */}
        {/* Marks that JS is running, before first paint. Scroll-triggered
            reveals only hold their hidden frame when this class is present, so
            a blocked or broken bundle degrades to content that is simply
            visible rather than an empty page. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {/* One gradient definition per document; every mark references it. */}
          <CoditusMarkDefs />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
