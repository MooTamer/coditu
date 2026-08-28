"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import { setIsDeveloper, updateAppSettings } from "@/lib/actions/earnings";
import { hours, rateFromMicros, timestamp, usdFromCents } from "@/lib/format";
import type { AppSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { control } from "@/lib/interactive";

const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)]";

export interface SprintOption {
  id: string;
  label: string;
}

export interface DeveloperOption {
  id: string;
  fullName: string;
  isDeveloper: boolean;
  isActive: boolean;
}

/**
 * Every tunable in Coditu, with its current value, what it affects, and who may
 * change it.
 *
 * This screen exists because of one standing instruction from the team:
 * *"nothing is hardcoded, everything that is a decision is editable in the
 * interface."* Every number the thread brief named — $12 an hour, 25%, 8 MB,
 * 2400 minutes, six images a paste — is the **initial value of a row here**,
 * and the only place those digits appear in this repository is the migration's
 * `default`.
 *
 * A rate that lives in a `const` is a change request that needs a deploy, and
 * this team deploys their own tool.
 *
 * Every field saves on blur rather than behind a Save button, and every one of
 * them says what it affects underneath — a settings screen where you have to
 * guess what a number does is a settings screen nobody touches.
 */
export function AdminSettings({
  settings,
  sprints,
  developers,
}: {
  settings: AppSettings;
  sprints: SprintOption[];
  developers: DeveloperOption[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {!settings.configured ? (
        <p className="rounded-control border border-dashed border-[var(--hairline-strong)] px-4 py-3 text-[13px] text-[var(--ink-muted)]">
          These are the built-in defaults — the settings row has not been read from the database.
          On a database that has not had `20260825090000_app_settings.sql` applied yet, that is
          expected, and everything still renders.
        </p>
      ) : null}

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
        <NumberSetting
          label="Hourly rate"
          suffix="USD / hour"
          affects="What a sprint's pot is worth. Stored in cents; a sprint's pot is minutes × rate ÷ 60, with the division last."
          value={settings.hourlyRateCents / 100}
          step={0.5}
          min={0.5}
          format={(n) => usdFromCents(Math.round(n * 100))}
          onSave={(n) => ({ hourlyRateCents: Math.round(n * 100) })}
        />

        <NumberSetting
          label="Proposal threshold"
          suffix="% of a sprint's minutes"
          affects="Who is pre-ticked on the confirmation screen. A suggestion engine — the confirmed set is whatever an admin agrees, and somebody at exactly this number is in."
          value={settings.payoutShareThresholdPct}
          step={1}
          min={0}
          max={100}
          format={(n) => `${Math.round(n)}%`}
          onSave={(n) => ({ payoutShareThresholdPct: Math.round(n) })}
        />

        <NumberSetting
          label="Image upload cap"
          suffix="MB"
          affects="The largest image the editor accepts. The refusal names this number, so raising it here changes what people are told."
          value={settings.maxImageBytes / (1024 * 1024)}
          step={1}
          min={1}
          max={64}
          format={(n) => `${Math.round(n)} MB`}
          onSave={(n) => ({ maxImageBytes: Math.round(n) * 1024 * 1024 })}
        />

        <NumberSetting
          label="Images per paste"
          suffix="at once"
          affects="How many pictures one paste or drop uploads. Beyond it the editor says so rather than silently dropping the rest."
          value={settings.maxImageBatch}
          step={1}
          min={1}
          max={50}
          format={(n) => String(Math.round(n))}
          onSave={(n) => ({ maxImageBatch: Math.round(n) })}
        />

        <NumberSetting
          label="Default weekly capacity"
          suffix="hours"
          affects="What a newly created profile starts with. Changing somebody's own capacity is on People."
          value={settings.defaultWeeklyCapacityMinutes / 60}
          step={0.5}
          min={0.5}
          max={168}
          format={(n) => `${hours(Math.round(n * 60))} h`}
          onSave={(n) => ({ defaultWeeklyCapacityMinutes: Math.round(n * 60) })}
        />

        <EffectiveFrom settings={settings} sprints={sprints} />
      </div>

      <ExchangeRate settings={settings} />
      <Developers developers={developers} />
    </div>
  );
}

function NumberSetting({
  label,
  suffix,
  affects,
  value,
  step,
  min,
  max,
  format,
  onSave,
}: {
  label: string;
  suffix: string;
  affects: string;
  value: number;
  step: number;
  min: number;
  max?: number;
  format: (n: number) => string;
  onSave: (n: number) => Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(String(value));
  const [last, setLast] = useState(value);

  // Adjusted during render rather than in an effect — the same pattern the item
  // fields use, and for the same reason.
  if (value !== last) {
    setLast(value);
    setDraft(String(value));
  }

  function save() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < min || (max !== undefined && next > max)) {
      setDraft(String(value));
      toast(`${label} must be between ${min} and ${max ?? "…"}.`);
      return;
    }
    if (next === value) return;
    startTransition(async () => {
      const result = await settle(
        () => updateAppSettings(onSave(next)),
        "That setting did not save — check your connection."
      );
      if (result.ok) {
        router.refresh();
        return;
      }
      setDraft(String(value));
      toast(result.error ?? "That setting did not save.");
    });
  }

  return (
    <label className="flex flex-col gap-[6px]">
      <span className="flex items-baseline gap-2">
        <Mono size="eyebrow" className="text-[var(--ink-faint)]">
          {label}
        </Mono>
        {pending ? (
          <Loader2
            size={11}
            strokeWidth={2}
            className="animate-spin text-[var(--ink-faint)] motion-reduce:animate-none"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        <input
          className={cn(FIELD, "max-w-[110px] tabular-nums")}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <Mono size="meta" className="text-[var(--ink-faint)]">
          {suffix}
        </Mono>
      </span>
      <span className="text-[12px] leading-[1.45] text-[var(--ink-faint)]">
        now {format(value)} · {affects}
      </span>
    </label>
  );
}

function EffectiveFrom({
  settings,
  sprints,
}: {
  settings: AppSettings;
  sprints: SprintOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function set(value: string) {
    startTransition(async () => {
      const result = await settle(
        () => updateAppSettings({ payoutFromSprintId: value || null }),
        "That setting did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That setting did not save.");
    });
  }

  return (
    <label className="flex flex-col gap-[6px]">
      <Mono size="eyebrow" className="text-[var(--ink-faint)]">
        Earnings tracked from
      </Mono>
      <select
        className={FIELD}
        value={settings.payoutFromSprintId ?? ""}
        disabled={pending}
        onChange={(event) => set(event.target.value)}
      >
        <option value="">not tracked yet</option>
        {sprints.map((sprint) => (
          <option key={sprint.id} value={sprint.id}>
            {sprint.label}
          </option>
        ))}
      </select>
      <span className="text-[12px] leading-[1.45] text-[var(--ink-faint)]">
        Sprints before this one read “not tracked”, never zero — zero is a claim about money that
        was never counted. Past confirmations are untouched by changing this.
      </span>
    </label>
  );
}

/**
 * The exchange rate: what is stored, where it came from, and how to override it.
 *
 * The stored value is the source of truth for every figure the app renders. The
 * live fetch only ever updates it, daily at most, in the background, and it
 * never blocks a page. Setting one by hand switches the source to `manual`,
 * which is what stops the refresh overwriting it.
 */
function ExchangeRate({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  /**
   * Which control was pressed, so that one reports and the others do not.
   *
   * `pending` is shared by every action in this component, and binding it
   * straight to each button lights all of them on any click — the exact bug
   * PF-4's first draft shipped and `e2e/interactive-states.spec.ts` caught.
   * `onClickCapture` records the presser before the handler runs and works for
   * a keyboard activation too; nothing has to clear it, because the conjunction
   * with `pending` goes false on its own when the work finishes.
   */
  const [acting, setActing] = useState<string | null>(null);
  const [draft, setDraft] = useState(
    settings.usdEgpRateMicros ? rateFromMicros(settings.usdEgpRateMicros) : ""
  );

  function saveManual() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 1 || next > 1000) {
      toast("A rate between 1 and 1000 EGP to the dollar, please.");
      return;
    }
    startTransition(async () => {
      const result = await settle(
        () => updateAppSettings({ usdEgpRateMicros: Math.round(next * 1_000_000) }),
        "That rate did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That rate did not save.");
    });
  }

  function backToLive() {
    startTransition(async () => {
      const result = await settle(
        () => updateAppSettings({ usdEgpSource: "live" }),
        "That change did not save — check your connection."
      );
      if (result.ok) {
        toast("Back to the live rate. It refreshes on the next visit to Earnings.");
        router.refresh();
      } else toast(result.error ?? "That change did not save.");
    });
  }

  return (
    <section
      aria-labelledby="fx"
      className="rounded-control border border-[var(--hairline)] bg-[var(--canvas)] p-4"
    >
      <h3 id="fx" className="text-[14px] font-semibold">
        Exchange rate
      </h3>
      <p className="mt-1 max-w-[72ch] text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
        {settings.usdEgpRateMicros
          ? `EGP ${rateFromMicros(settings.usdEgpRateMicros)} to the dollar · ${
              settings.usdEgpSource === "manual" ? "set by hand" : "live"
            }${settings.usdEgpFetchedAt ? `, ${timestamp(settings.usdEgpFetchedAt)}` : ""}`
          : "No rate stored yet, so earnings show in USD only."}{" "}
        A confirmed sprint keeps the rate it was confirmed at, for ever.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className={cn(FIELD, "max-w-[120px] tabular-nums")}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="1"
          max="1000"
          placeholder="50.86"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          onClickCapture={() => setActing("c1")}
          {...control(pending && acting === "c1" ? "pending" : "idle")}
          type="button"
          onClick={saveManual}
          disabled={pending}
          className="h-[34px] rounded-control border border-[var(--hairline-strong)] px-3 text-[12.5px] font-medium disabled:opacity-50"
        >
          Set by hand
        </button>
        {settings.usdEgpSource === "manual" ? (
          <button
          onClickCapture={() => setActing("c2")}
          {...control(pending && acting === "c2" ? "pending" : "idle")}
            type="button"
            onClick={backToLive}
            disabled={pending}
            className="inline-flex h-[34px] items-center gap-2 rounded-control border border-[var(--hairline)] px-3 text-[12.5px] text-[var(--ink-muted)] disabled:opacity-50"
          >
            <RefreshCcw size={13} strokeWidth={1.9} aria-hidden />
            Back to live
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Who takes a share of a sprint's pot.
 *
 * A column an admin sets, and **never a name or an email in code** — the brief
 * is explicit, and the reason is obvious the first time somebody joins or
 * leaves. A non-developer's minutes still count toward the pot; the
 * confirmation screen names them and says they take no share.
 */
function Developers({ developers }: { developers: DeveloperOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function toggle(person: DeveloperOption) {
    startTransition(async () => {
      const result = await settle(
        () => setIsDeveloper({ profileId: person.id, isDeveloper: !person.isDeveloper }),
        "That change did not save — check your connection."
      );
      if (result.ok) router.refresh();
      else toast(result.error ?? "That change did not save.");
    });
  }

  return (
    <section
      aria-labelledby="developers"
      className="rounded-control border border-[var(--hairline)] bg-[var(--canvas)] p-4"
    >
      <h3 id="developers" className="text-[14px] font-semibold">
        Who takes a share
      </h3>
      <p className="mt-1 max-w-[72ch] text-[12.5px] leading-[1.5] text-[var(--ink-faint)]">
        A sprint&rsquo;s pot is split equally between the people ticked here who logged time on it.
        Everyone else&rsquo;s hours still count toward the pot — the confirmation screen names them
        and says so.
      </p>

      <ul className="mt-3 flex flex-col gap-1">
        {developers.map((person) => (
          <li key={person.id}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-[var(--raised)]">
              <input
                type="checkbox"
                checked={person.isDeveloper}
                disabled={pending}
                onChange={() => toggle(person)}
                className="size-[18px] accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate text-[13.5px]">
                {person.fullName}
                {person.isActive ? "" : " (deactivated)"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
