import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { navItems } from "../_lib/content";

import { AnchorLink } from "./anchor-link";
import { Container } from "./container";
import { MobileNav } from "./mobile-nav";

export function Navbar() {
  return (
    <header
      data-navbar-root="true"
      className="sticky top-0 z-50 border-b border-black/10 bg-white/82 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/74"
    >
      <Container className="flex h-[--navbar-height] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="Strukture Digital logo"
            width={42}
            height={42}
            className="size-10 rounded-xl object-cover shadow-[0_8px_18px_-14px_rgba(15,23,42,0.55)]"
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Strukture Digital
          </span>
        </Link>

        <nav className="hidden items-center gap-2 rounded-full border border-black/10 bg-white/92 px-4 py-2.5 shadow-[0_14px_28px_-20px_rgba(15,23,42,0.42)] md:flex">
          {navItems.map((item) => (
            <AnchorLink
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
              {item.label}
            </AnchorLink>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild className="h-12 rounded-full px-8 text-[15px] font-semibold shadow-[0_12px_22px_-16px_rgba(30,64,175,0.8)]">
            <AnchorLink href="#contact">Request a Call</AnchorLink>
          </Button>
        </div>

        <MobileNav navItems={navItems} />
      </Container>
    </header>
  );
}
