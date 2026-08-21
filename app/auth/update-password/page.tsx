import type { Metadata } from "next";
import Link from "next/link";

import { SetPasswordForm } from "@/components/app/set-password-form.client";
import { CoditusLockup } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set a password",
  robots: { index: false, follow: false },
};

/**
 * Choose a password for an account that already exists.
 *
 * Deliberately NOT under `/login`: the middleware sends a signed-in visitor
 * from `/login` to `/app`, and by the time somebody arrives here they ARE
 * signed in — the callback route exchanged their link for a session. Putting
 * this under `/login` would bounce them off the page they were sent to.
 *
 * It reads the user rather than the profile: `getCurrentProfile()` also demands
 * an active profile row, and someone who has been deactivated should be told
 * that by the sign-in page rather than silently handed a password form.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] p-6 text-[var(--ink)]">
      <Reveal tier="section" className="w-full max-w-[380px]">
        <CoditusLockup markSize={26} />

        <h1 className="mt-8 text-[24px] font-bold leading-[1.2] tracking-[-0.022em]">
          {user ? "Set your password" : "That link is no longer valid"}
        </h1>

        {user ? (
          <>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
              Your account and everything on it stays exactly as it is — this only changes how you
              sign in.
            </p>
            <div className="mt-6">
              <SetPasswordForm email={user.email ?? ""} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
              Links can only be used once, and they expire. Ask for a new one and it will bring you
              straight back here.
            </p>
            <Link
              href="/login"
              className="mt-6 flex h-[38px] w-full items-center justify-center rounded-control border border-[var(--hairline-strong)] text-[13.5px] font-medium hover:bg-[var(--raised)]"
            >
              Back to sign in
            </Link>
          </>
        )}

        <Mono size="meta" className="mt-8 block text-[var(--ink-faint)]">
          coditu · invite only
        </Mono>
      </Reveal>
    </main>
  );
}
