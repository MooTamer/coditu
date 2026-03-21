"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import type { NavItem } from "../_lib/content";

import { AnchorLink } from "./anchor-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface MobileNavProps {
  navItems: NavItem[];
}

export function MobileNav({ navItems }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const handleNavigate = () => {
    setOpen(false);
  };

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full border border-black/10 bg-white/78 backdrop-blur"
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[88vw] border-l border-black/10 bg-white/95 backdrop-blur-xl sm:max-w-sm">
          <SheetHeader className="border-b border-black/10 pb-5">
            <SheetTitle className="font-display text-xl">Navigate</SheetTitle>
            <SheetDescription>
              Explore work, services, process, insights, and contact.
            </SheetDescription>
          </SheetHeader>
          <nav className="mt-8 flex flex-col gap-2 px-4">
            {navItems.map((item) => (
              <AnchorLink
                key={item.href}
                href={item.href}
                onNavigate={handleNavigate}
                className="rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-black/5"
              >
                {item.label}
              </AnchorLink>
            ))}
          </nav>
          <div className="mt-8 px-4">
            <Button asChild className="h-11 w-full rounded-full px-6 text-sm font-semibold">
              <AnchorLink href="#contact" onNavigate={handleNavigate}>
                Request a Call
              </AnchorLink>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
