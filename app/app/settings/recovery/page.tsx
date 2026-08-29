import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { PageShell } from "@/components/app/page-shell";
import { RehearseRecovery } from "@/components/app/rehearse-recovery.client";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { assessBackupHealth } from "@/lib/backup-health";
import {
  getBackupHealth,
  getRecoveryStanding,
  listRecoveryRuns,
  type RecoveryRun,
} from "@/lib/data/recovery";
import { CHECK_LABEL } from "@/lib/recovery";
import { getCurrentProfile } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Backup & recovery" };

/**
 * Could we actually get it back?
 *
 * ## Two responsibilities, kept apart and labelled
 *
 * **Infrastructure** — managed database backups, point-in-time recovery, and
 * Storage, which managed database backups do not cover at all. This
 * application cannot create or inspect that infrastructure itself. It accepts
 * one deliberately narrow fact: the independent off-site canary can report the
 * object and sidecar it just read. No report means no claim, and old evidence
 * turns amber by elapsed time without waiting for another write.
 *
 * ## What this card got wrong, and why it is worth a paragraph
 *
 * Until 2026-08-27 it said that without PITR "the recoverable position is
 * whatever the last daily backup holds". There is no daily backup.
 * `supabase backups list` returns `pitr_enabled: false` and an empty `backups`
 * array, and Supabase's daily backups are a Pro/Team/Enterprise feature — this
 * project is on Free, where the documented advice is to export your own copy.
 *
 * So the screen was offering a fallback that does not exist. Everything below
 * about not inventing a number is about the same failure in the other
 * direction: an invented figure is believed, and a *reassuring* one is believed
 * hardest. `docs/09-BACKUP-PROPOSAL.md` §1 carries the command and its output.
 *
 * **Application recovery** — the four things the app owns, and a rehearsal
 * that exercises them. That half is real, is checked on demand, and records
 * what it found.
 *
 * ## Nothing here invents a number
 *
 * No schedule, retention period, snapshot id or recovery objective is rendered
 * before a successful canary record exists. The prototype has all four and
 * every one of them is demonstration content —
 * "Nightly · 03:00 UTC", "42 MB", `snap-2026-08-25-03`. A recovery screen is
 * the last place in an application to display a figure nobody chose: it would
 * be believed, and it would be believed on the worst day.
 *
 * `docs/05-DECISIONS.md` records the capability boundary. The screen says only
 * what the canary measured, dates it, and names what that evidence cannot prove.
 */
export default async function RecoveryPage() {
  const profile = await getCurrentProfile();
  if (!profile) notFound();

  // Reading is admin-only at the database — `recovery_runs` has one policy and
  // it is `auth_role() = 'admin'`. The page does not redirect a lead the way
  // `/app/settings` does, because unlike the tunables there is something here
  // worth their reading: what recovery rests on, and what has been checked.
  // They simply get no runs and a disabled button that says why.
  const canRun = profile.role === "admin";
  const [runs, standing, backupHealth] = await Promise.all([
    listRecoveryRuns(),
    getRecoveryStanding(),
    getBackupHealth(),
  ]);
  const latest = runs[0] ?? null;
  const backupAssessment = backupHealth ? assessBackupHealth(backupHealth) : null;
  const backupCurrent = backupAssessment?.state === "current";

  return (
    <PageShell measure="recovery">
      <Reveal tier="section" as="header">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          non-destructive by design · a rehearsal writes nothing back
        </Mono>
        <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.022em]">Backup &amp; recovery</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Whether the work could actually be got back, and when anybody last checked. The rehearsal
          copies into a schema it creates and drops, and touches nothing live.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        as="section"
        aria-labelledby="infrastructure"
        data-infrastructure
        data-backup-health={backupCurrent ? "current" : backupHealth ? "stale" : "unverified"}
        className={cn(
          "rounded-list border bg-[var(--raised)] p-6",
          backupCurrent ? "border-[var(--tone-jade-fg)]" : "border-[var(--tone-amber-fg)]"
        )}
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="infrastructure" className="text-[16px] font-bold tracking-[-0.015em]">
            Infrastructure backups
          </h2>
          <ToneChip tone={backupCurrent ? "jade" : "amber"}>
            {backupCurrent
              ? "off-site canary current"
              : backupHealth
                ? "off-site canary stale"
                : "not verified by this app"}
          </ToneChip>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          {backupHealth
            ? `The independent off-site reader last reported at ${stamp(backupHealth.checkedAt)}. ` +
              (backupCurrent
                ? "Its evidence and the newest encrypted set are both inside their current windows."
                : "That evidence is now outside the report or recovery-point window, so it makes no current coverage claim.")
            : "No successful off-site canary has reported into this database. Code, a schedule and an objective are not a restore point, so this card still states no backup figure."}
        </p>

        <dl className="mt-4 flex flex-col gap-2.5">
          <Fact
            label="Point-in-time recovery"
            value="off"
            detail="Read from the hosted project on 2026-08-27: pitr_enabled is false. Nothing can be wound back to the moment before a mistake."
            tone="amber"
          />
          <Fact
            label="Provider-held backups"
            value={
              backupHealth
                ? `Supabase none · off-site ${backupCurrent ? "current" : "stale"}`
                : "none"
            }
            detail={
              backupHealth
                ? `Supabase still has no managed restore point. Separately, the freshness canary read recovery set ${backupHealth.backupId} at ${stamp(backupHealth.checkedAt)}; ${backupCurrent ? "that off-site evidence is current" : "that off-site evidence is stale and must not be treated as current coverage"}.`
                : "The same read returned an empty set — no backup the provider could restore from. Its daily backups cover the Pro, Team and Enterprise plans; this project is on Free, where the documented advice is to export your own copy, and nobody has. There is no restore point: not last night's, not any. `docs/09-BACKUP-PROPOSAL.md` §1 carries the command, its output, and what it would take to fix."
            }
            tone={backupCurrent ? "jade" : "amber"}
          />
          <Fact
            label="Storage buckets"
            value={backupHealth ? `${backupHealth.storageObjects.toLocaleString("en-GB")} objects recorded` : "not covered"}
            detail={
              backupHealth
                ? `The downloaded sidecar records ${backupHealth.storageBuckets.toLocaleString("en-GB")} buckets and ${backupHealth.storageObjects.toLocaleString("en-GB")} objects beside ${backupHealth.databaseTables.toLocaleString("en-GB")} database tables and ${backupHealth.databaseRows.toLocaleString("en-GB")} rows. The freshness canary matches that sidecar to the stored archive and to the record written beside it; only the quarterly private-key restore proves the ciphertext contains readable bytes.`
                : "A managed database backup covers the database and nothing else. Avatars and work attachments live in Storage and would not be inside one even if this project had one — which is why the rehearsal checks attachments separately."
            }
            tone={backupCurrent ? "jade" : "amber"}
          />
          <Fact
            label="Recovery objective and drills"
            value={
              backupHealth && backupAssessment
                ? backupCurrent
                  ? "24-hour objective met"
                  : backupAssessment.rpoMet
                    ? "canary report stale"
                    : "24-hour objective missed"
                : "not set"
            }
            detail={
              backupHealth && backupAssessment
                ? `At render, the encrypted set is ${formatAge(backupAssessment.backupAgeSeconds)} old and ${formatBytes(backupHealth.encryptedBytes)}. Freshness does not prove retention, monthly integrity or a restore; those remain separate controls, and RTO remains unset.`
                : "The chosen objective is deliberately withheld here until a real off-site canary reports. Retention, integrity and restore timing remain unverified, because a number nobody measured would be believed on the worst day."
            }
            tone={backupCurrent ? "jade" : "amber"}
          />
        </dl>

        <p className="mt-4 max-w-[72ch] text-[13px] leading-[1.55] text-[var(--ink-muted)]">
          {/* The one sentence this screen exists to make impossible to miss.
              Everything the application guarantees is a row in the database it
              is guaranteeing, so none of it survives losing that database. */}
          <strong className="font-semibold text-[var(--ink)]">
            Version history is not a backup.
          </strong>{" "}
          It protects against somebody changing their mind. It protects against nothing that
          happens to the database itself — every version, every binned story and every access
          event is a row in the same project, and a project that is gone takes all three with it.
          That is what the four facts above are about. This application can display a canary&apos;s
          narrow evidence; it still cannot create, decrypt or restore the off-site copy from inside
          itself.
        </p>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.12}
        as="section"
        aria-labelledby="standing"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="standing" className="text-[16px] font-bold tracking-[-0.015em]">
            What there is to recover
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            counts, not contents
          </Mono>
        </div>

        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <Count label="Versions kept" value={standing.revisions} href="/app/history" />
          <Count label="In the bin" value={standing.binned} href="/app/trash" />
          <Count label="Access events" value={standing.accessEvents} href="/app/people" />
          <Count label="Attachments" value={standing.attachments} />
        </div>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.18}
        as="section"
        aria-labelledby="rehearse"
        className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="rehearse" className="text-[16px] font-bold tracking-[-0.015em]">
            Rehearse a recovery
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {canRun ? "admin only" : "an admin runs this"}
          </Mono>
        </div>

        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-[1.55] text-[var(--ink-muted)]">
          Each check copies what it needs into an isolated schema, verifies it there, and drops it.
          Nothing is written back — restoring a document is still the button on Version history, and
          restoring a story is still the one in the bin, both of which write a new version rather
          than overwriting one.
        </p>

        <div className="mt-4">
          <RehearseRecovery canRun={canRun} />
        </div>
      </Reveal>

      <Reveal tier="section" delay={0.24} as="section" aria-labelledby="runs">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="runs" className="text-[16px] font-bold tracking-[-0.015em]">
            Rehearsals
          </h2>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {latest
              ? `last one ${latest.status} · ${stamp(latest.finishedAt)}`
              : "nobody has run one yet"}
          </Mono>
        </div>

        {runs.length === 0 ? (
          <p className="mt-3 rounded-list border border-[var(--hairline)] bg-[var(--raised)] px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
            {canRun
              ? "No recovery has been rehearsed. The first one is the one worth running."
              : "No recovery has been rehearsed, and only an admin can run one."}
          </p>
        ) : (
          <ul data-recovery-runs className="mt-3 flex flex-col gap-2">
            {runs.map((run) => (
              <li key={run.id}>
                <Run run={run} />
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </PageShell>
  );
}

function Run({ run }: { run: RecoveryRun }) {
  return (
    <details
      data-recovery-run
      data-status={run.status}
      className="group rounded-list border border-[var(--hairline)] bg-[var(--raised)] open:border-[var(--hairline-strong)]"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 marker:content-none">
        {/* The word, not only the colour. A recovery screen read in a hurry is
            exactly where `01-DESIGN-SYSTEM.md`'s rule earns itself. */}
        <ToneChip tone={run.status === "passed" ? "jade" : "amber"}>{run.status}</ToneChip>
        <span className="text-[13.5px] font-medium">
          {run.scope.map((check) => CHECK_LABEL[check]).join(" · ")}
        </span>
        <Mono size="meta" className="text-[11.5px] text-[var(--ink-faint)]">
          {run.checked} checked · {run.failed} failed · {run.actor?.fullName ?? "somebody"} ·{" "}
          <time dateTime={run.finishedAt}>{stamp(run.finishedAt)}</time>
        </Mono>
      </summary>

      <div className="border-t border-[var(--hairline)] px-5 py-3">
        {run.findings.length === 0 ? (
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {run.failed === 0
              ? "nothing to report — every check passed"
              : "the failures were not recorded individually"}
          </Mono>
        ) : (
          <>
            {run.failed > run.findings.length ? (
              <Mono size="meta" className="mb-2 block text-[var(--ink-faint)]">
                the first {run.findings.length} of {run.failed}
              </Mono>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {run.findings.map((finding, index) => (
                <li key={`${run.id}-${index}`} className="text-[12.5px] leading-[1.5]">
                  <Mono size="meta" className="text-[var(--ink-muted)]">
                    {CHECK_LABEL[finding.check] ?? finding.check}
                  </Mono>{" "}
                  <span className="font-medium">{finding.subject}</span>{" "}
                  <span className="text-[var(--ink-muted)]">— {finding.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

function Fact({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "amber" | "slate" | "jade";
}) {
  // `<dt>` and `<dd>` are DIRECT children of the one grouping `<div>`, which is
  // the only nesting a `<dl>` allows. The first version put them inside a
  // second flex wrapper for layout and axe refused the whole list —
  // `definition-list` plus a `dlitem` for every pair. The layout comes from
  // `flex-wrap` on the group instead, which needed no extra element.
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dashed border-[var(--hairline)] pb-2.5 last:border-0 last:pb-0">
      <dt className="text-[13.5px] font-medium">{label}</dt>
      <dd className="min-w-0 flex-1">
        <ToneChip tone={tone}>{value}</ToneChip>
        <p className="mt-1 max-w-[72ch] text-[12.5px] leading-[1.5] text-[var(--ink-muted)]">
          {detail}
        </p>
      </dd>
    </div>
  );
}

function Count({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <Mono size="eyebrow" className="block text-[var(--ink-faint)]">
        {label}
      </Mono>
      <span className="mt-2 block text-[22px] font-bold leading-none tabular-nums">
        {value.toLocaleString("en-GB")}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-inner border border-[var(--hairline)] p-4 hover:bg-[var(--canvas)]"
    >
      {body}
      <ArrowRight size={12} strokeWidth={2} aria-hidden className="mt-2 text-[var(--ink-faint)]" />
    </Link>
  ) : (
    <div className="rounded-inner border border-[var(--hairline)] p-4">{body}</div>
  );
}

function formatAge(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(mebibytes < 10 ? 1 : 0)} MiB`;
}

/** `26 Aug, 21:11` in Africa/Cairo — invariant 5, at the render edge. */
function stamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
