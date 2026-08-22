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
 * This is where the forced change lands. An admin has generated a temporary
 * password and read it out; the account signs in with it and the app shell
 * redirects here until a real one is set. Nothing under `/app` renders in
 * between, which is the entire point — a password somebody else knows is not a
 * password.
 *
 * Deliberately NOT under `/login`: the middleware sends a signed-in visitor
 * from `/login` to `/app`, and by the time somebody arrives here they ARE
 * signed in. Putting this under `/login` would bounce them off the page they
 * were sent to. It is also deliberately outside the middleware matcher — see
 * the note there — so this page must be reachable without one.
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
          {user ? "Set your password" : "You are not signed in"}
        </h1>

        {user ? (
          <>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
              Choose one only you know. Your account and everything on it stays exactly as it is —
              this only changes how you sign in, and nothing else in Coditu opens until it is done.
            </p>
            <div className="mt-6">
              <SetPasswordForm email={user.email ?? ""} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ink-muted)]">
              Sign in first, with the temporary password an admin gave you, and you will be brought
              straight back here to choose your own.
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
