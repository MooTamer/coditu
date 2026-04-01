import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { display, inter } from "@/lib/fonts";
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
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-clip">
      <body className={`${inter.variable} ${display.variable} min-w-0 overflow-x-clip font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
