import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { display, inter } from "@/lib/fonts";
import { marketingContent } from "@/lib/marketing-content";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(marketingContent.siteMeta.siteUrl),
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
