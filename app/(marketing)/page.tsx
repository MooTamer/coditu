import type { Metadata } from "next";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import { Services } from "@/components/landing/services";
import { Team } from "@/components/landing/team";
import { Testimonials } from "@/components/landing/testimonials";
import { UseCases } from "@/components/landing/use-cases";
import { Work } from "@/components/landing/work";
import { marketingContent } from "@/lib/marketing-content";

const { siteMeta } = marketingContent;

export const metadata: Metadata = {
  title: siteMeta.pageTitle,
  description: siteMeta.description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteMeta.ogTitle,
    description: siteMeta.ogDescription,
    url: "/",
    siteName: siteMeta.siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: siteMeta.ogImage,
        width: 1200,
        height: 630,
        alt: siteMeta.siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteMeta.ogTitle,
    description: siteMeta.ogDescription,
    images: [siteMeta.ogImage],
  },
};

export default function Home() {
  return (
    <div className="relative min-h-screen min-w-0 overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_20%_-10%,rgba(56,189,248,0.13),transparent_42%),radial-gradient(circle_at_86%_8%,rgba(59,130,246,0.1),transparent_38%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 landing-grid landing-noise" />

      <Navbar />
      <main>
        <Hero />
        <UseCases />
        <Work />
        <Team />
        {/* <Process /> */}
        <Services />
        <Testimonials />
        {/* <Insights /> */}
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
