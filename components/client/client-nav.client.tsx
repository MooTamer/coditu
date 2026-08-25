"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Two destinations, and that is the whole navigation model.
 *
 * No rail, no tab bar, no overflow sheet. The portal is two screens deep and a
 * bar of four items with two of them empty is furniture — the internal app
 * needs one because it has nine destinations and a phone, this does not.
 *
 * The waiting count sits on Questions rather than on a bell. A notification
 * bell is a place things accumulate; a number on the thing itself is a
 * sentence: "there are two here for you".
 */
const ITEMS = [
  { href: "/client", label: "Overview", isActive: (path: string) => path === "/client" },
  {
    href: "/client/questions",
    label: "Questions",
    isActive: (path: string) => path.startsWith("/client/questions"),
  },
] as const;

export function ClientNav({ waiting }: { waiting: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="ml-4 flex items-center gap-1">
      {ITEMS.map((item) => {
        const current = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={current ? "page" : undefined}
            className={`inline-flex h-11 items-center gap-2 rounded-control px-3 text-[13.5px] font-medium ${
              current ? "bg-[var(--ui-hover)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {item.label}
            {item.label === "Questions" && waiting > 0 ? (
              <span
                className="inline-flex min-w-[19px] items-center justify-center rounded-pill bg-[var(--amber)] px-[6px] text-[11px] font-bold text-[var(--tone-amber-fg)]"
                // The number is decorative beside the label; the sentence is
                // what a screen reader should hear.
                aria-hidden
              >
                {waiting}
              </span>
            ) : null}
            {item.label === "Questions" && waiting > 0 ? (
              <span className="sr-only">
                {waiting === 1 ? "one question waiting for you" : `${waiting} questions waiting for you`}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
