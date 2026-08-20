import type { Metadata } from "next";

import { RevealScope } from "@/components/motion/reveal-scope.client";
import { Contact } from "@/components/site/contact";
import { Faq } from "@/components/site/faq.client";
import { Hero } from "@/components/site/hero";
import { DeliveryNotes, Process, Services, Team, UseCases } from "@/components/site/sections";
import { SignalTrace } from "@/components/site/signal-trace.client";
import { SiteNav } from "@/components/site/site-nav.client";
import { Work } from "@/components/site/work";
import { faq, siteMeta, team } from "@/lib/marketing-content";
import { getAbsoluteUrl } from "@/lib/site-url";

const canonical = getAbsoluteUrl("/");

export const metadata: Metadata = {
  title: siteMeta.pageTitle,
  description: siteMeta.description,
  alternates: { canonical },
  openGraph: {
    title: siteMeta.ogTitle,
    description: siteMeta.ogDescription,
    url: canonical,
    siteName: siteMeta.siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: getAbsoluteUrl(siteMeta.ogImage),
        width: 1200,
        height: 630,
        alt: "Coditu — portals, internal systems, and RAG assistants",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteMeta.ogTitle,
    description: siteMeta.ogDescription,
    images: [getAbsoluteUrl(siteMeta.ogImage)],
  },
};

/**
 * Structured data.
 *
 * Every claim here is also on the page: the same four people, the same three
 * cities, the same email. Marking up something the reader cannot see is how
 * structured data turns into a lie, and search engines treat it as one.
 */
function structuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${canonical}#organization`,
        name: siteMeta.siteName,
        url: canonical,
        email: siteMeta.email,
        description: siteMeta.description,
        logo: getAbsoluteUrl("/brand/mark.svg"),
        image: getAbsoluteUrl(siteMeta.ogImage),
        numberOfEmployees: { "@type": "QuantitativeValue", value: team.length },
        address: siteMeta.foundingLocations.map((city) => ({
          "@type": "PostalAddress",
          addressLocality: city,
          addressCountry: city === "Cairo" ? "EG" : "DE",
        })),
        employee: team.map((member) => ({
          "@type": "Person",
          name: member.name,
          jobTitle: member.role,
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${canonical}#website`,
        url: canonical,
        name: siteMeta.siteName,
        description: siteMeta.description,
        publisher: { "@id": `${canonical}#organization` },
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: faq.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      },
    ],
  };
}

export default function MarketingPage() {
  return (
    <div className="relative min-h-dvh">
      {/* The dot field and the noise, both fixed and both behind everything.
          `mask-image` fades the dots out before they reach the fold, so the
          texture reads at the top of the page and never behind body copy. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 [background-image:radial-gradient(var(--dot)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_0%,#000_25%,transparent_78%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.03] mix-blend-overlay [background-image:url(&quot;data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='3'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E&quot;)]"
      />

      <SignalTrace />
      <SiteNav email={siteMeta.email} />

      <main className="relative z-1">
        <Hero />
        <Work />
        <Services />
        <Process />
        <UseCases />
        <Team />
        <DeliveryNotes />
        <Faq />
      </main>

      <Contact />

      {/* One observer for every [data-reveal-on-view] on the page. */}
      <RevealScope />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
    </div>
  );
}
