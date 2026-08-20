import { notFound } from "next/navigation";

import { CoditusLockup, CoditusMark } from "@/components/coditu/coditus-mark";
import { Mono } from "@/components/coditu/mono";
import { StatusChip, ToneChip } from "@/components/coditu/status-chip";
import {
  STATUS_DISPLAY_ORDER,
  WORK_ITEM_STATUSES,
  groupingHue,
  groupingStickyBg,
  groupingTint,
} from "@/lib/work-items";

import { TierDemo } from "./tier-demo.client";

export const metadata = { title: "Tokens", robots: { index: false, follow: false } };

/* -------------------------------------------------------------------------- */

const SURFACES = [
  ["--canvas", "page ground"],
  ["--raised", "cards, panels, the rail"],
  ["--overlay", "modals, popovers, the palette"],
  ["--hairline", "default separator"],
  ["--hairline-strong", "input and control borders"],
] as const;

const INK = [
  ["--ink", "primary text", "17.6:1 dark · 18.4:1 light"],
  ["--ink-muted", "secondary text", "7.4:1 dark · 6.0:1 light"],
  ["--ink-faint", "mono metadata — held at AA, not decoration", "5.6:1 dark · 5.0:1 light"],
  ["--accent", "the action colour", "12.1:1 dark (aqua)"],
] as const;

const FUNCTIONAL = [
  ["--amber", "#FFB020", "running long, near deadline"],
  ["--rose", "#FF5F6D", "blocked, changes requested"],
  ["--jade", "#23C97F", "done, healthy"],
  ["--slate", "#6B7A90", "draft, unassigned"],
] as const;

const RADII = [
  ["--radius-chip", "6px", "chips"],
  ["--radius-control", "10px", "inputs, buttons"],
  ["--radius-inner", "12px", "inner panels"],
  ["--radius-card", "14px", "cards"],
  ["--radius-list", "16px", "list sections"],
  ["--radius-section", "20px", "top-level sections, modals"],
  ["--radius-pill", "999px", "pills"],
] as const;

const DIMENSIONS = [
  ["Rail", "72px → 240px"],
  ["Topbar", "60px"],
  ["Row", "52px comfortable / 44px compact"],
  ["Item detail", "max-width 1080px"],
  ["Export dialog", "max-width 1000px"],
  ["Burn-up", 'viewBox "0 0 300 108"'],
  ["AC ring", 'r=15, dasharray "94.2"'],
] as const;

const MARKETING_TYPE = [
  ["--text-display", "clamp(2.75rem, 1.6rem + 5.2vw, 6rem)"],
  ["--text-h1", "clamp(2rem, 1.4rem + 2.2vw, 3rem)"],
  ["--text-h2", "clamp(1.75rem, 1.3rem + 1.9vw, 2.5rem)"],
  ["--text-h3", "clamp(1.5rem, 1.2rem + 1.2vw, 2rem)"],
  ["--text-h4", "clamp(1.25rem, 1.1rem + 0.7vw, 1.5rem)"],
  ["--text-body", "clamp(1rem, 0.96rem + 0.18vw, 1.125rem)"],
] as const;

const APP_TYPE = [
  [26, "sprint name, the h metric", "-0.024em"],
  [22, "section h1", "-0.022em"],
  [15.5, "item detail title", "—"],
  [14.5, "rail labels", "—"],
  [13.5, "controls, table cells", "—"],
  [12.5, "code blocks (1.6 leading)", "—"],
  [11, "mono keys, counts, chips", "—"],
  [10.5, "mono uppercase eyebrows", "0.06em"],
] as const;

/* -------------------------------------------------------------------------- */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.022em]">{title}</h2>
        {note ? <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, label, meta }: { token: string; label: string; meta?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-3">
      <span
        className="size-10 shrink-0 rounded-chip border border-[var(--hairline-strong)]"
        style={{ background: `var(${token})` }}
      />
      <span className="min-w-0">
        <Mono size="key" className="block truncate">
          {token}
        </Mono>
        <span className="block truncate text-[12px] text-[var(--ink-muted)]">{label}</span>
        {meta ? (
          <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
            {meta}
          </Mono>
        ) : null}
      </span>
    </div>
  );
}

/** The whole token surface, rendered against whichever theme wraps it. */
function Panel({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      className={theme}
      style={{ background: "var(--canvas)", color: "var(--ink)" }}
    >
      <div className="flex flex-col gap-10 p-6">
        <div className="flex items-center justify-between gap-4">
          <CoditusLockup markSize={28} />
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {theme}
          </Mono>
        </div>

        <Section title="Surfaces" note="Elevation is hairline plus a background step. The only shadow in the system is on overlays.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map(([token, label]) => (
              <Swatch key={token} token={token} label={label} />
            ))}
          </div>
          <div
            className="rounded-section border border-[var(--hairline-strong)] bg-[var(--overlay)] p-4"
            style={{ boxShadow: "var(--shadow-overlay)" }}
          >
            <Mono size="meta">--shadow-overlay · the only shadow</Mono>
          </div>
        </Section>

        <Section title="Ink" note="ink-faint carries mono metadata, so it is held at AA in both themes rather than treated as decoration.">
          <div className="grid gap-2 sm:grid-cols-2">
            {INK.map(([token, label, meta]) => (
              <Swatch key={token} token={token} label={label} meta={meta} />
            ))}
          </div>
          <div className="rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-4">
            <p className="text-[15px] text-[var(--ink)]">Primary ink — body copy and headings.</p>
            <p className="mt-1 text-[13.5px] text-[var(--ink-muted)]">Muted ink — secondary copy, card summaries, table cells.</p>
            <Mono size="key" className="mt-1 block text-[var(--ink-faint)]">
              COD-142 · dev started · 7.5 / 8h · 2026-08-23
            </Mono>
          </div>
        </Section>

        <Section title="Brand" note="The gradient appears on at most three elements per viewport, never behind body text.">
          <div className="flex flex-wrap items-center gap-3">
            <span className="signal-gradient h-10 w-48 rounded-control" />
            <Mono size="meta">linear-gradient(135deg, #2B57FF, #21E2C6)</Mono>
          </div>
        </Section>

        <Section title="Functional" note="Status and warnings only, never decoration.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FUNCTIONAL.map(([token, hex, label]) => (
              <Swatch key={token} token={token} label={label} meta={hex} />
            ))}
          </div>
        </Section>

        <Section
          title="Status chips"
          note="Each is a themed pair. Compare the same chip across the two panels — the light foreground would sit at roughly 2.4:1 on the dark canvas."
        >
          <div className="flex flex-wrap gap-2">
            {WORK_ITEM_STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
          <div>
            <Mono size="eyebrow" className="text-[var(--ink-faint)]">
              display order — boards, reports, exports, sorting
            </Mono>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {STATUS_DISPLAY_ORDER.map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  {i > 0 ? <span className="text-[var(--ink-faint)]">→</span> : null}
                  <StatusChip status={s} />
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToneChip tone="amber">3 days left</ToneChip>
            <ToneChip tone="jade">Week 17</ToneChip>
            <ToneChip tone="slate">no sprint</ToneChip>
          </div>
        </Section>

        <Section
          title="Grouping"
          note="Deterministic per integer. The hue lives on the 3px left border and the tint only — the number itself is ink, because an 11px label in the hue never clears 4.5:1. Sticky backgrounds are opaque and pre-mixed, or the sticky column goes see-through over a tinted row."
        >
          <div className="overflow-hidden rounded-list border border-[var(--hairline)]">
            {[1, 2, 3, 7, null].map((g, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-[var(--hairline)] px-3 last:border-b-0"
                style={{ height: "52px", background: groupingTint(g), borderLeft: `3px solid ${groupingHue(g) ?? "transparent"}` }}
              >
                <span
                  className="flex h-full items-center pr-3"
                  style={{ background: groupingStickyBg(g) }}
                >
                  <Mono size="key">COD-{140 + i}</Mono>
                </span>
                <span className="flex-1 truncate text-[13.5px]">Sticky task cell over a tinted row</span>
                <span
                  className="rounded-chip border px-2 py-[3px]"
                  style={{
                    background: g ? "var(--group-chip-bg)" : "transparent",
                    borderColor: groupingHue(g) ?? "var(--hairline)",
                  }}
                >
                  <Mono size="meta" className={g ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}>
                    {g ?? "—"}
                  </Mono>
                </span>
              </div>
            ))}
          </div>
          <Mono size="meta" className="text-[var(--ink-faint)]">
            1 and 2 are pinned to the bundle. 3 and 7 are hash-derived — same integer, same hue, every time.
          </Mono>
        </Section>

        <Section title="Type — marketing" note="Fluid on every step. Body caps at 68ch, display at 18ch.">
          <div className="flex flex-col gap-3">
            {MARKETING_TYPE.map(([token, value]) => (
              <div key={token} className="rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-3">
                <Mono size="meta" className="text-[var(--ink-faint)]">
                  {token} — {value}
                </Mono>
                <p className="mt-1 truncate font-display font-bold tracking-[-0.024em]" style={{ fontSize: `var(${token})` }}>
                  One team owns the whole build
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type — app" note="Fixed steps, because density is the point.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th scope="col" className="py-2"><Mono size="eyebrow" className="text-[var(--ink-faint)]">px</Mono></th>
                  <th scope="col" className="py-2"><Mono size="eyebrow" className="text-[var(--ink-faint)]">use</Mono></th>
                  <th scope="col" className="py-2"><Mono size="eyebrow" className="text-[var(--ink-faint)]">tracking</Mono></th>
                  <th scope="col" className="py-2"><Mono size="eyebrow" className="text-[var(--ink-faint)]">sample</Mono></th>
                </tr>
              </thead>
              <tbody>
                {APP_TYPE.map(([px, use, tracking]) => (
                  <tr key={px} className="border-b border-[var(--hairline)] last:border-b-0">
                    <td className="py-2 pr-4"><Mono size="key">{px}</Mono></td>
                    <td className="py-2 pr-4 text-[13px] text-[var(--ink-muted)]">{use}</td>
                    <td className="py-2 pr-4"><Mono size="meta" className="text-[var(--ink-faint)]">{tracking}</Mono></td>
                    <td className="py-2" style={{ fontSize: `${px}px` }}>Sprint — Week 17</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Geometry">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {RADII.map(([token, value, label]) => (
              <div key={token} className="flex items-center gap-3 rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-3">
                <span
                  className="size-10 shrink-0 border border-[var(--hairline-strong)] bg-[var(--canvas)]"
                  style={{ borderRadius: `var(${token})` }}
                />
                <span className="min-w-0">
                  <Mono size="meta" className="block truncate">{value}</Mono>
                  <span className="block truncate text-[12px] text-[var(--ink-muted)]">{label}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIMENSIONS.map(([label, value]) => (
              <div key={label} className="rounded-inner border border-[var(--hairline)] bg-[var(--raised)] p-3">
                <span className="block text-[12px] text-[var(--ink-muted)]">{label}</span>
                <Mono size="meta" className="block">{value}</Mono>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="The mark"
          note="Three motion states, one object. All transform, opacity, or dashoffset only; all no-ops under reduced motion. Zero JavaScript — every state is CSS."
        >
          <div className="flex flex-wrap items-end gap-8">
            {[20, 32, 64].map((s) => (
              <span key={s} className="flex flex-col items-center gap-2">
                <CoditusMark size={s} />
                <Mono size="meta" className="text-[var(--ink-faint)]">{s}px</Mono>
              </span>
            ))}
            <span className="flex flex-col items-center gap-2">
              <CoditusMark size={32} variant="mono" />
              <Mono size="meta" className="text-[var(--ink-faint)]">mono</Mono>
            </span>
            <span className="flex flex-col items-center gap-2">
              <CoditusMark size={32} spin title="Saving" />
              <Mono size="meta" className="text-[var(--ink-faint)]">spin 1.4s</Mono>
            </span>
            <span className="flex flex-col items-center gap-2">
              <CoditusMark size={32} animated />
              <Mono size="meta" className="text-[var(--ink-faint)]">draw-on 900ms</Mono>
            </span>
            <span className="flex flex-col items-center gap-2">
              <CoditusMark size={32} hoverTravel />
              <Mono size="meta" className="text-[var(--ink-faint)]">hover — node runs the arc</Mono>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <CoditusLockup markSize={32} />
            <CoditusLockup markSize={32} orientation="stacked" />
            <CoditusLockup markSize={24} variant="mono" />
          </div>
        </Section>

        <Section title="Motion tiers">
          <TierDemo />
        </Section>

        <Section title="Focus ring" note="2px accent plus a 2px canvas-coloured offset ring, so it reads on any surface. Tab through these.">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="rounded-control border border-[var(--hairline-strong)] px-4 py-2 text-[13.5px]">On raised</button>
            <button type="button" className="rounded-control bg-[var(--overlay)] px-4 py-2 text-[13.5px]">On overlay</button>
            <button type="button" className="signal-gradient rounded-control px-4 py-2 text-[13.5px] font-semibold text-[#07090E]">On gradient</button>
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function TokensPage() {
  // Never ships. This page exists to make the token layer reviewable, and a
  // route that renders every token in both themes is exactly the thing you do
  // not want indexed or reachable in production.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-dvh">
      <div className="border-b border-[var(--hairline)] px-6 py-4">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Coditu tokens</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">
          Every token and motion tier, rendered in both themes side by side. Source of truth is{" "}
          <code className="font-mono text-[12px]">app/globals.css</code>; the written spec is{" "}
          <code className="font-mono text-[12px]">docs/01-DESIGN-SYSTEM.md</code>.
        </p>
      </div>
      <div className="grid xl:grid-cols-2">
        <Panel theme="light" />
        <Panel theme="dark" />
      </div>
    </main>
  );
}
