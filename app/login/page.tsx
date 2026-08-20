import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/app/login-form.client";
import { CoditusLockup } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in · Coditu",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentProfile()) redirect(next ?? "/app");

  return (
    <main className="grid min-h-dvh bg-[var(--canvas)] text-[var(--ink)] lg:grid-cols-2">
      {/* Brand-forward half. Hidden below lg rather than squeezed — a lockup at
          120px of width is not brand-forward, it is a logo in a corner. */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--hairline)] bg-[var(--raised)] p-10 lg:flex">
        <CoditusLockup markSize={30} animated />
        <div>
          <p className="max-w-[18ch] text-[clamp(2rem,1.4rem+2.2vw,3rem)] font-bold leading-[1.08] tracking-[-0.028em]">
            One team owns the whole build.
          </p>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-[var(--ink-muted)]">
            Portals, internal systems, RAG assistants, and the web applications around them —
            scoped, designed, built, launched, and kept running by the same four people.
          </p>
        </div>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          Munich · Ulm · Cairo
        </Mono>
      </section>

      <section className="flex items-center justify-center p-6">
        <Reveal tier="surface" className="w-full max-w-[380px]">
          <div className="lg:hidden">
            <CoditusLockup markSize={26} />
          </div>
          <h1 className="mt-6 text-[22px] font-bold tracking-[-0.022em] lg:mt-0">Sign in</h1>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
            Coditu is an internal tool. There is no public sign-up — your address has to be on the
            allowlist.
          </p>
          <LoginForm next={next ?? "/app"} />
        </Reveal>
      </section>
    </main>
  );
}
