"use client";

import { useState, useTransition } from "react";
import { Copy, Trash2, UserPlus } from "lucide-react";

import { settle } from "@/lib/action-result";
import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import {
  ACCESS_PRESETS,
  CAPABILITY_LABEL,
  CAPABILITY_REVEALS,
  CLIENT_CAPABILITIES,
  DEFAULT_PRESET,
  SENSITIVE_CAPABILITIES,
  describeAccess,
  resolveCapabilities,
  type ClientCapability,
  type PresetName,
} from "@/lib/client-access";
import {
  inviteClientContact,
  restoreClientAccess,
  revokeClientAccess,
  withdrawInvitation,
} from "@/lib/actions/client-access";
import type { ClientAccessRow } from "@/lib/data/client-access";
import { calendarDate } from "@/lib/format";

const FIELD =
  "h-11 w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-3 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)]";

/**
 * Who at a client company may see what.
 *
 * ── No optimistic update here, deliberately ────────────────────────────────
 *
 * Everywhere else in this app a mutation shows immediately and rolls back on
 * failure, because the cost of being briefly wrong is a row that flickers.
 * Here the cost of being briefly wrong is an admin believing they revoked
 * somebody's access when they did not. Access changes wait for the server and
 * say so while they wait. Invariant 4 asks for a rollback path and a visible
 * error; the honest reading for this screen is not to make the claim early.
 *
 * ── The password is shown once ─────────────────────────────────────────────
 *
 * `docs/05-DECISIONS.md` (2026-08-22): there is no email in this application.
 * The invitation creates the account and returns a password, which lives in
 * this component's state and nowhere else — not in a table, not in a log, and
 * there is no second endpoint that will hand it out again. It is dismissed
 * explicitly rather than on a timer, because a panel that vanishes while
 * somebody is copying it is worse than one that has to be closed.
 */
export function ClientAccessPanel({
  rows,
  isAdmin,
}: {
  rows: ClientAccessRow[];
  isAdmin: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [openInviteFor, setOpenInviteFor] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await work().catch(() => ({
        ok: false,
        // A thrown Server Action never reaches the `ok: false` branch, so the
        // toast never fires and the screen just stops. The field note on this
        // is "A Server Action can reject, and your rollback never runs".
        error: "That did not reach the server. Check your connection and try again.",
      }));
      toast(result.ok ? success : (result.error ?? "That did not save."));
    });
  }

  if (rows.length === 0) {
    return (
      <p className="max-w-[62ch] text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
        There are no clients yet. Add one on Projects, then come back to give somebody there access.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {issued ? (
        <div
          role="status"
          className="rounded-section border border-[var(--amber)] bg-[var(--tone-amber-bg)] p-5"
        >
          <h3 className="text-[15px] font-bold tracking-[-0.014em] text-[var(--tone-amber-fg)]">
            Read this to {issued.email} now
          </h3>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--tone-amber-fg)]">
            It is shown once and stored nowhere. They will have to choose their own password before
            they can use it. If it is lost, invite them again.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Mono size="meta" className="rounded-control bg-[var(--raised)] px-3 py-2 text-[15px]">
              {issued.password}
            </Mono>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(issued.password)
                  .then(() => toast("Password copied."))
                  .catch(() => toast("Could not copy — select it and copy by hand."));
              }}
              className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] bg-[var(--raised)] px-3 text-[13.5px] font-medium"
            >
              <Copy size={14} strokeWidth={2} aria-hidden />
              Copy
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="inline-flex h-11 items-center rounded-control px-3 text-[13.5px] font-medium text-[var(--tone-amber-fg)] underline"
            >
              I have it
            </button>
          </div>
        </div>
      ) : null}

      {rows.map((row) => (
        <section key={row.clientId} aria-labelledby={`client-${row.clientId}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 id={`client-${row.clientId}`} className="text-[16px] font-bold tracking-[-0.015em]">
              {row.clientName}
            </h3>

            {isAdmin && row.projects.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setOpenInviteFor(openInviteFor === row.clientId ? null : row.clientId)
                }
                aria-expanded={openInviteFor === row.clientId}
                className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] font-medium hover:bg-[var(--ui-hover)]"
              >
                <UserPlus size={15} strokeWidth={2} aria-hidden />
                Invite a contact
              </button>
            ) : null}
          </div>

          {row.projects.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-[var(--ink-faint)]">
              No projects yet, so there is nothing to give access to.
            </p>
          ) : null}

          {openInviteFor === row.clientId ? (
            <InviteForm
              row={row}
              pending={pending}
              onCancel={() => setOpenInviteFor(null)}
              onDone={(email, password) => {
                setOpenInviteFor(null);
                setIssued({ email, password });
              }}
              onError={(message) => toast(message)}
            />
          ) : null}

          <ul className="mt-4 flex flex-col gap-3">
            {row.contacts.map((contact) => {
              const live = contact.grants.filter((grant) => grant.revokedAt === null);
              const revoked = contact.status === "revoked";

              return (
                <li
                  key={contact.profileId}
                  className="rounded-card border border-[var(--hairline)] bg-[var(--raised)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-medium">{contact.fullName}</p>
                      <p className="mt-1 text-[12.5px] text-[var(--ink-faint)]">
                        {revoked
                          ? "Access withdrawn"
                          : contact.acceptedAt
                            ? `Signed in · invited ${calendarDate(contact.invitedAt)}`
                            : `Has not signed in yet · invited ${calendarDate(contact.invitedAt)}`}
                      </p>
                    </div>

                    {isAdmin ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !revoked &&
                            !confirm(
                              `Withdraw ${contact.fullName}'s access? They keep their account and stop seeing anything, immediately. Their messages stay where they are.`
                            )
                          ) {
                            return;
                          }
                          run(
                            () =>
                              revoked
                                ? settle(() => restoreClientAccess({ contactProfileId: contact.profileId }), "That access was not restored.")
                                : settle(() => revokeClientAccess({ contactProfileId: contact.profileId }), "That access was not revoked."),
                            revoked
                              ? `${contact.fullName} has access again.`
                              : `${contact.fullName} no longer has access.`
                          );
                        }}
                        className="inline-flex h-11 items-center rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] font-medium disabled:opacity-60"
                      >
                        {revoked ? "Restore access" : "Withdraw access"}
                      </button>
                    ) : null}
                  </div>

                  {live.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2">
                      {live.map((grant) => (
                        <li key={grant.projectId} className="text-[13px]">
                          <span className="font-medium">{grant.projectName}</span>
                          <span className="text-[var(--ink-muted)]">
                            {" — "}
                            {describeAccess(grant.capabilities).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
                      No live access to any project.
                    </p>
                  )}
                </li>
              );
            })}

            {row.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-card border border-dashed border-[var(--hairline-strong)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium break-words">{invitation.email}</p>
                    <p className="mt-1 text-[12.5px] text-[var(--ink-faint)]">
                      {invitation.isExpired
                        ? `Invitation expired ${calendarDate(invitation.expiresAt)}`
                        : `Invited, not signed in yet · expires ${calendarDate(invitation.expiresAt)}`}
                      {invitation.projectNames.length > 0
                        ? ` · ${invitation.projectNames.join(", ")}`
                        : ""}
                    </p>
                  </div>

                  {isAdmin ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => settle(() => withdrawInvitation({ invitationId: invitation.id }), "That invitation was not withdrawn."),
                          `${invitation.email} can no longer sign up.`
                        )
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] font-medium disabled:opacity-60"
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden />
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </li>
            ))}

            {row.contacts.length === 0 && row.invitations.length === 0 ? (
              <li className="text-[13.5px] text-[var(--ink-faint)]">Nobody here has access yet.</li>
            ) : null}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The invite form, with the effective access shown before the button.
 *
 * The list under the toggles is not decoration. An admin is deciding what a
 * person outside the company may see, and the two capabilities most likely to
 * be granted without thinking — total hours, and files — carry their full
 * "this reveals…" sentence rather than hiding it behind a tooltip nobody opens.
 */
function InviteForm({
  row,
  pending,
  onCancel,
  onDone,
  onError,
}: {
  row: ClientAccessRow;
  pending: boolean;
  onCancel: () => void;
  onDone: (email: string, password: string) => void;
  onError: (message: string) => void;
}) {
  const [preset, setPreset] = useState<PresetName>(DEFAULT_PRESET);
  const [custom, setCustom] = useState<ClientCapability[]>(ACCESS_PRESETS.collaborator.slice());
  const [projectIds, setProjectIds] = useState<string[]>(
    row.projects.length === 1 ? [row.projects[0].id] : []
  );
  const [busy, setBusy] = useState(false);

  const effective = resolveCapabilities(preset, custom);

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-section border border-[var(--hairline-strong)] bg-[var(--raised)] p-4"
      action={async (formData) => {
        setBusy(true);
        try {
          // `settle`, not the hand-rolled `.catch` this had. Same failure
          // result; the difference is that a `redirect()` out of the action is
          // rethrown rather than reported as a connection problem.
          const result = await settle(
            () =>
              inviteClientContact({
                email: String(formData.get("email") ?? ""),
                clientId: row.clientId,
                projectIds,
                preset,
                capabilities: custom,
              }),
            "That did not reach the server. Check your connection and try again."
          );

          if (result.ok && "password" in result && result.password) {
            onDone(String(formData.get("email") ?? "").trim().toLowerCase(), result.password);
          } else {
            onError(result.error ?? "That did not save.");
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-[6px]">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          Their email
        </Mono>
        <input className={FIELD} type="email" name="email" required placeholder="person@client.com" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Which projects
          </Mono>
        </legend>
        {row.projects.map((project) => (
          <label key={project.id} className="flex min-h-11 items-center gap-3 text-[14px]">
            <input
              type="checkbox"
              className="size-[18px]"
              checked={projectIds.includes(project.id)}
              onChange={(event) =>
                setProjectIds((current) =>
                  event.target.checked
                    ? [...current, project.id]
                    : current.filter((id) => id !== project.id)
                )
              }
            />
            {project.name}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            How much access
          </Mono>
        </legend>
        {(["collaborator", "observer", "custom"] as const).map((name) => (
          <label key={name} className="flex min-h-11 items-center gap-3 text-[14px]">
            <input
              type="radio"
              name="preset"
              className="size-[18px]"
              checked={preset === name}
              onChange={() => setPreset(name)}
            />
            {name === "collaborator"
              ? "Collaborator — can read and reply (recommended)"
              : name === "observer"
                ? "Observer — read only"
                : "Custom"}
          </label>
        ))}
      </fieldset>

      {preset === "custom" ? (
        <fieldset className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
          <legend className="sr-only">Capabilities</legend>
          {CLIENT_CAPABILITIES.map((capability) => (
            <label key={capability} className="flex min-h-11 items-start gap-3 py-1 text-[13.5px]">
              <input
                type="checkbox"
                className="mt-[2px] size-[18px] shrink-0"
                checked={custom.includes(capability)}
                onChange={(event) =>
                  setCustom((current) =>
                    event.target.checked
                      ? [...current, capability]
                      : current.filter((value) => value !== capability)
                  )
                }
              />
              <span className="min-w-0">
                <span className="font-medium">{CAPABILITY_LABEL[capability]}</span>
                {SENSITIVE_CAPABILITIES.includes(capability) ? (
                  <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-[var(--amber-text)]">
                    {CAPABILITY_REVEALS[capability]}
                  </span>
                ) : (
                  <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
                    {CAPABILITY_REVEALS[capability]}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="rounded-card border border-[var(--hairline)] bg-[var(--canvas)] p-3">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          They will be able to
        </Mono>
        <ul className="mt-2 flex flex-col gap-1">
          {describeAccess(effective).map((line) => (
            <li key={line} className="text-[13px] leading-[1.5] text-[var(--ink-muted)]">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
        No email is sent — this application has no mail transport. You will be given a password once,
        to pass on yourself.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || busy || projectIds.length === 0}
          className="inline-flex h-11 items-center rounded-control bg-[var(--ink)] px-4 text-[13.5px] font-medium text-[var(--canvas)] disabled:opacity-60"
        >
          {busy ? "Creating the account…" : "Create the account"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center rounded-control px-4 text-[13.5px] font-medium text-[var(--ink-muted)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
