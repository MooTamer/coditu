import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { display, inter } from "./fonts";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://strukturedigital.com"),
  title: {
    default: "Strukture Digital | All-in-one digital partner",
    template: "%s | Strukture Digital",
  },
  description:
    "All-in-one services for modern businesses. Strukture Digital builds websites, web apps, business systems, SEO performance programs, and AI assistants for teams worldwide.",
  openGraph: {
    title: "Strukture Digital | Built for teams worldwide",
    description:
      "End-to-end digital products delivered across Germany, Egypt, and the USA.",
    url: "https://strukturedigital.com",
    siteName: "Strukture Digital",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Strukture Digital",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Strukture Digital | All-in-one digital partner",
    description: "Built for teams worldwide.",
    images: ["/logo.png"],
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
