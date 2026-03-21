import Image from "next/image";
import Link from "next/link";

import { MobileNav } from "@/components/landing/mobile-nav";
import { Container } from "@/components/landing/container";
import { Button } from "@/components/ui/button";
import { marketingContent } from "@/lib/marketing-content";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 py-4 backdrop-blur-xl">
      <Container className="flex h-[--navbar-height] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="Strukture Digital logo"
            width={42}
            height={42}
            suppressHydrationWarning
            className="size-10 rounded-xl object-cover shadow-[0_8px_18px_-14px_rgba(15,23,42,0.55)]"
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {marketingContent.siteMeta.siteName}
          </span>
        </Link>

        <nav className="hidden items-center gap-2 rounded-full border border-black/10 bg-white/92 px-4 py-2.5 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.42)] md:flex">
          {marketingContent.navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button
            asChild
            className="h-12 rounded-full px-8 text-[15px] font-semibold shadow-[0_12px_22px_-16px_rgba(30,64,175,0.8)]"
          >
            <a href="#contact">{marketingContent.hero.secondaryCtaLabel}</a>
          </Button>
        </div>

        <MobileNav navItems={marketingContent.navItems} />
      </Container>
    </header>
  );
}
