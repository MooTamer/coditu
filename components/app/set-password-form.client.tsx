"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setPassword, type AuthState } from "@/lib/actions/auth";
import { Mono } from "@/components/coditu/mono";

const FIELD =
  "h-[38px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[13.5px] text-[var(--ink)] outline-none focus-visible:border-[var(--accent)]";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="signal-gradient h-[38px] w-full rounded-control text-[13.5px] font-semibold text-[#07090E] disabled:opacity-70"
    >
      {children}
    </button>
  );
}

/**
 * Choose a password for an account that already exists.
 *
 * No "current password" field: the only way to arrive here with a session is
 * through a single-use link sent to the address on the account, so the session
 * is the proof. `/auth/update-password` checks for one before rendering this.
 */
export function SetPasswordForm({ email }: { email: string }) {
  const [state, action] = useActionState<AuthState, FormData>(setPassword, {});
  const message = state.error ?? state.notice;

  return (
    <div className="flex flex-col gap-3">
      <Mono size="meta" className="text-[var(--ink-faint)]">
        {email}
      </Mono>

      <form action={action} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            New password
          </Mono>
          <input
            className={FIELD}
            type="password"
            name="password"
            autoComplete="new-password"
            enterKeyHint="next"
            required
            minLength={8}
          />
        </label>

        <label className="flex flex-col gap-1">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Again
          </Mono>
          <input
            className={FIELD}
            type="password"
            name="confirm"
            autoComplete="new-password"
            enterKeyHint="go"
            required
            minLength={8}
          />
        </label>

        <SubmitButton>Set password</SubmitButton>
      </form>

      {message ? (
        <p
          role={state.error ? "alert" : "status"}
          data-auth-message={state.error ? "error" : "notice"}
          aria-live="polite"
          className="text-[12.5px] leading-[1.5]"
          style={{ color: state.error ? "var(--tone-amber-fg)" : "var(--ink-muted)" }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
