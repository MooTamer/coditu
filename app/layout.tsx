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
