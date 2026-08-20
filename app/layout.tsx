import type { Metadata } from "next";

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
    template: "%s | Strukture Digital",
  },
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-clip">
      <body className={`${fontVariables} min-w-0 overflow-x-clip font-sans antialiased`}>
        {/* Dark-first: the design is built on the dark canvas and light is the
            alternate. System preference is deliberately not consulted — see
            docs/05-DECISIONS.md. */}
        {/* Marks that JS is running, before first paint. Scroll-triggered
            reveals only hold their hidden frame when this class is present, so
            a blocked or broken bundle degrades to content that is simply
            visible rather than an empty page. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {/* One gradient definition per document; every mark references it. */}
          <CoditusMarkDefs />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
