import Image from "next/image";

import { SectionShell } from "@/components/landing/section-shell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { marketingContent } from "@/lib/marketing-content";

export function Footer() {
  const currentYear = new Date().getUTCFullYear();
  const { footer, navItems, siteMeta } = marketingContent;

  return (
    <SectionShell
      as="footer"
      id="contact"
      className="pb-10 pt-14"
      containerClassName="rounded-[2rem] border border-black/10 bg-white/90 p-6 shadow-[0_24px_54px_-42px_rgba(15,23,42,0.4)] sm:p-10"
    >
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Strukture Digital logo"
              width={42}
              height={42}
              suppressHydrationWarning
              className="rounded-xl object-cover"
            />
            <p className="font-display text-xl font-semibold tracking-tight">{siteMeta.siteName}</p>
          </div>
          <h2 className="font-display text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            {footer.title}
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {footer.description}
          </p>
          <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-semibold">
            <a href={`mailto:${footer.email}`}>{footer.emailCtaLabel}</a>
          </Button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Navigate
            </p>
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Contact
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{footer.email}</p>
              {footer.contactLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-6" />
      <p className="text-xs text-muted-foreground">
        © <time dateTime={String(currentYear)} suppressHydrationWarning>{currentYear}</time>{" "}
        {siteMeta.siteName}.{" "}
        {footer.copyright}
      </p>
    </SectionShell>
  );
}
