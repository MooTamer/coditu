"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { CoditusMark } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { signIn, signUp, type AuthState } from "@/lib/actions/auth";

const FIELD =
  "h-[38px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="signal-gradient flex h-[38px] w-full items-center justify-center gap-2 rounded-control text-[13.5px] font-semibold text-[#07090E] disabled:opacity-70"
    >
      {pending ? <CoditusMark size={16} spin /> : null}
      {children}
    </button>
  );
}

export function LoginForm({
  next,
  linkFailed = false,
}: {
  next: string;
  /** The callback route sent them back here because the link was dead. */
  linkFailed?: boolean;
}) {
  const [passwordState, passwordAction] = useActionState<AuthState, FormData>(signIn, {});
  const [joinState, joinAction] = useActionState<AuthState, FormData>(signUp, {});
  // Sign-in and sign-up share every field but one, so they are one form in two
  // modes rather than two forms — a second password box on the same screen is
  // how people end up typing their password into the wrong one.
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const linkError = linkFailed
    ? "That link is no longer valid. Sign in with your password, or ask an admin for a temporary one."
    : undefined;

  // `linkError` comes from the URL, so it outlives the submit that follows it —
  // it goes LAST, or a fresh attempt would still be answered with the stale
  // sentence instead of what actually just happened.
  const message = passwordState.error ?? joinState.error ?? joinState.notice ?? linkError;
  const isError =
    Boolean(passwordState.error ?? joinState.error) ||
    (message !== undefined && message === linkError);
  const joining = mode === "signup";

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="flex rounded-control border border-[var(--hairline)] bg-[var(--raised)] p-[3px]"
      >
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`h-[30px] flex-1 rounded-[7px] text-[13px] font-semibold transition-[background-color,color] duration-[var(--dur-micro)] ${
              mode === value
                ? "bg-[var(--canvas)] text-[var(--ink)]"
                : "text-[var(--ink-muted)]"
            }`}
          >
            {value === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form action={joining ? joinAction : passwordAction} className="flex flex-col gap-3">
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
            required
            placeholder="you@coditu.com"
          />
        </label>

        {joining ? (
          <label className="flex flex-col gap-[6px]">
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              Your name
            </Mono>
            <input
              className={FIELD}
              type="text"
              name="fullName"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Mohamed Tamer"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Password
          </Mono>
          <input
            className={FIELD}
            type="password"
            name="password"
            autoComplete={joining ? "new-password" : "current-password"}
            required
            minLength={joining ? 8 : undefined}
          />
        </label>

        <SubmitButton>{joining ? "Create account" : "Sign in"}</SubmitButton>
      </form>

      {joining ? (
        <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
          Coditu is invite-only. Your address has to be on the allowlist already — an admin adds it
          on People.
        </p>
      ) : null}

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
          // An error is announced assertively; a notice ("check your inbox") is
          // polite. One `role` for both would either interrupt for good news or
          // let a failure pass unheard.
          role={isError ? "alert" : "status"}
          // Next renders its own empty `role="alert"` route announcer, so tests
          // need something that identifies THIS element rather than whichever
          // live region the framework happened to mount first.
          data-auth-message={isError ? "error" : "notice"}
          aria-live="polite"
          className="text-[12.5px] leading-[1.5]"
          style={{ color: isError ? "var(--tone-amber-fg)" : "var(--ink-muted)" }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
