"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { CoditusMark } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { sendMagicLink, signIn, type AuthState } from "@/lib/actions/auth";

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

export function LoginForm({ next }: { next: string }) {
  const [passwordState, passwordAction] = useActionState<AuthState, FormData>(signIn, {});
  const [linkState, linkAction] = useActionState<AuthState, FormData>(sendMagicLink, {});

  const message = passwordState.error ?? linkState.error ?? linkState.notice;
  const isError = Boolean(passwordState.error ?? linkState.error);

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
            required
            placeholder="you@coditu.com"
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Password
          </Mono>
          <input className={FIELD} type="password" name="password" autoComplete="current-password" required />
        </label>

        <SubmitButton>Sign in</SubmitButton>
      </form>

      {/* Magic link is the fallback, so it is a second form rather than a mode
          switch — one field, one button, no state to get wrong. */}
      <form action={linkAction} className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
        <input type="hidden" name="next" value={next} />
        <input
          className={FIELD}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="Email a sign-in link instead"
        />
        <button
          type="submit"
          className="h-[38px] w-full rounded-control border border-[var(--hairline-strong)] text-[13.5px] font-medium hover:bg-[var(--canvas)]"
        >
          Send a sign-in link
        </button>
      </form>

      {message ? (
        <p
          role="status"
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
