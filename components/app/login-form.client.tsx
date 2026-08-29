"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { CoditusMark } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { control } from "@/lib/interactive";

const FIELD =
  "h-[38px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
        {...control(pending ? "pending" : "idle")}
      type="submit"
      disabled={pending}
      className="signal-gradient flex h-[38px] w-full items-center justify-center gap-2 rounded-control text-[13.5px] font-semibold text-[#07090E] disabled:opacity-70"
    >
      {pending ? <CoditusMark size={16} spin /> : null}
      {children}
    </button>
  );
}

/**
 * Sign in. There is nothing else on this screen, and that is the point.
 *
 * It carried a second mode until PF-10 — a `Create account` tab that collected
 * a name and called `signUp`. The account it made was never an open door
 * (`allowed_emails` refused anything uninvited, in the action AND in a BEFORE
 * INSERT trigger on `auth.users`), but an internal tool that offers to make you
 * an account is telling every visitor the wrong thing about what it is. The
 * gate stays; the invitation to walk up to it does not.
 *
 * Where accounts come from now is written in `docs/10-PRODUCT-FEEDBACK.md`
 * under PF-10, including the part that is still missing.
 */
export function LoginForm({
  next,
  linkFailed = false,
}: {
  next: string;
  /** The callback route sent them back here because the link was dead. */
  linkFailed?: boolean;
}) {
  const [passwordState, passwordAction] = useActionState<AuthState, FormData>(signIn, {});

  const linkError = linkFailed
    ? "That link is no longer valid. Sign in with your password, or ask an admin for a temporary one."
    : undefined;

  // `linkError` comes from the URL, so it outlives the submit that follows it —
  // it goes LAST, or a fresh attempt would still be answered with the stale
  // sentence instead of what actually just happened.
  const message = passwordState.error ?? linkError;
  const isError = message !== undefined;

  return (
    <div className="mt-6 flex flex-col gap-3">
      <form action={passwordAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Email
          </Mono>
          <input
            className={FIELD}
            type="email"
            name="email"
            autoComplete="email"
            // The phone keyboard's action key: Next moves to the password,
            // Go submits. A generic Return does neither and the reader has to
            // find the button.
            enterKeyHint="next"
            required
            placeholder="you@coditu.com"
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Password
          </Mono>
          <input
            className={FIELD}
            type="password"
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            required
          />
        </label>

        <SubmitButton>Sign in</SubmitButton>
      </form>

      {/* There is no "email me a link" and no "reset my password", and that is
          a decision rather than an omission. Both depended on SMTP the team
          does not have: Vercel's free tier allows two emails an hour and
          Supabase's shared sender is rate-limited and not meant for production.
          A password nobody can remember is now an admin's job on /app/people —
          they generate a temporary one, read it out, and the account cannot be
          used for anything else until it is changed. See docs/05-DECISIONS.md.

          What is left is one email field and one password field. */}
      <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
        Forgotten your password? Ask an admin for a temporary one — they can set it from People,
        and you will be asked to choose your own the moment you sign in.
      </p>

      {message ? (
        <p
          // Every message this form can now show is a refusal, so the assertive
          // role is unconditional. It was a ternary while sign-up could return
          // "check your inbox", which is the one notice that was ever polite.
          role="alert"
          // Next renders its own empty `role="alert"` route announcer, so tests
          // need something that identifies THIS element rather than whichever
          // live region the framework happened to mount first.
          data-auth-message={isError ? "error" : "notice"}
          aria-live="polite"
          className="text-[12.5px] leading-[1.5]"
          style={{ color: "var(--tone-amber-fg)" }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
