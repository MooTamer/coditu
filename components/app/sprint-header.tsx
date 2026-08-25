import { PersonAvatar } from "@/components/app/person-avatar";
import { ClientMark } from "@/components/app/client-mark";
import { SprintNotes } from "@/components/app/sprint-notes.client";
import type { ProfileRef } from "@/lib/data/profiles";
import { Mono } from "@/components/coditu/mono";
import { ToneChip } from "@/components/coditu/status-chip";
import { statusDistribution, type BurnPoint, type SprintDetail } from "@/lib/data/sprint";
import type { ProjectSummary } from "@/lib/data/projects";
import { dateRange, hours, hoursLabel } from "@/lib/format";
import { STATUS_LABEL, type WorkItemStatus } from "@/lib/work-items";

/**
 * The three-column sprint header. `minmax(280px, 1fr)` with auto-fit, so the
 * columns stack on their own when the shell is narrow rather than at a
 * viewport breakpoint someone has to keep in sync.
 */

/** Bar and legend colours. Deliberately the raw functional hues, not chip
 *  foregrounds: a 10px bar is a shape, not text, so it takes the saturated
 *  value rather than the AA-tuned one. */
const BAR_COLOR: Record<WorkItemStatus, string> = {
  in_progress: "#2B57FF",
  in_peer_review: "#FFB020",
  in_qa: "#21E2C6",
  changes_requested: "#FF5F6D",
  ready: "#6B7A90",
  draft: "rgba(107,122,144,0.35)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

export function SprintHeader({
  project,
  sprint,
  burn,
  daysLeft,
  members,
  canEdit,
  people,
  maxImageBatch,
}: {
  project: ProjectSummary;
  sprint: SprintDetail;
  burn: BurnPoint[];
  daysLeft: number | null;
  members: Array<{ initials: string; fullName: string; avatarUrl: string | null; minutes: number }>;
  /** Admin or lead. Sprints are theirs to change. */
  canEdit: boolean;
  /** Active profiles, for the notes editor's `@` list. */
  people: ProfileRef[];
  /** From `app_settings` — never a constant. */
  maxImageBatch: number;
}) {
  const slices = statusDistribution(sprint.items);
  const logged = sprint.items.reduce((total, item) => total + item.minutesLogged, 0);
  const estimate = sprint.items.reduce((total, item) => total + item.estimateMinutes, 0);

  return (
    <section className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--raised)]">
      <div
        // The bundle says minmax(280px, 1fr). Wrapped in min() because a hard
        // 280px floor overflows any container narrower than that — at 320px
        // with the rail showing there is about 230px to play with, and the
        // column would push the whole header off-screen. min(280px, 100%)
        // keeps the bundle's number wherever it fits and collapses to the
        // container width where it does not.
        className="grid gap-7 p-6 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]"
      >
        {/* Each column carries the `section` tier and its own stagger step.
            The card as a whole clears §4's ~40vh blur ceiling, and the remedy
            §4 gives for that is exactly this: blur the container's children in
            a stagger rather than the whole block. */}
        {/* ---- identity ---- */}
        <div data-reveal="section" className="min-w-0">
          <div className="flex flex-wrap items-center gap-[10px]">
            {project.clientUrl ? (
              <a
                href={project.clientUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-pill border border-[var(--hairline)] bg-[var(--canvas)] py-1 pl-[7px] pr-[9px]"
              >
                <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
                <Mono size="eyebrow" className="tracking-[0.05em]">
                  {project.clientName}
                </Mono>
                <Mono size="eyebrow" className="tracking-[0.05em] text-[var(--ink-faint)]">
                  {project.clientUrl.replace(/^https?:\/\/(www\.)?/, "")}
                </Mono>
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-pill border border-[var(--hairline)] bg-[var(--canvas)] py-1 pl-[7px] pr-[9px]">
                <ClientMark logoPath={project.clientLogoPath} accentHex={project.accentHex} size={14} />
                <Mono size="eyebrow" className="tracking-[0.05em]">
                  {project.clientName}
                </Mono>
              </span>
            )}
            <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              sprint {sprint.number} · {sprint.status}
            </Mono>
          </div>

          <h1 className="mt-[10px] text-[26px] font-bold tracking-[-0.024em]">{sprint.name}</h1>

          {/* The goal, at last. `sprints.goal` has been in the schema since the
              first migration and `grep -rn "goal" components/app app/app`
              returned nothing at all — a column no code path could write or
              read. It is the first thing anybody types on planning day and the
              sentence the rest of this header is evidence for, so it sits
              directly under the name. Written on the project's sprint list. */}
          {sprint.goal ? (
            <p className="mt-[6px] max-w-[52ch] text-[14px] leading-[1.5] text-[var(--ink-muted)]">
              {sprint.goal}
            </p>
          ) : null}

          <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
            <Mono size="key" className="text-[var(--ink-muted)]">
              {dateRange(sprint.startsOn, sprint.endsOn)}
            </Mono>
            {daysLeft !== null ? (
              <ToneChip tone="amber">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </ToneChip>
            ) : null}
          </div>

          {members.length > 0 ? (
            /**
             * The bundle draws these as bare faces with the per-person load in
             * a tooltip. **A tooltip is not something a finger can open**, so
             * on a narrow container the hours are rendered beside each face
             * instead — the same information, in the only form a touch screen
             * can reach. Wide, it is the bundle's design unchanged, caption and
             * all.
             *
             * A container query rather than a viewport one, for the reason the
             * sprint table already documents: pinning the rail open changes the
             * width here without the viewport moving at all.
             */
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {members.map((member) => (
                <span
                  key={member.initials}
                  className="flex items-center gap-[6px] rounded-pill @max-[640px]:border @max-[640px]:border-[var(--hairline)] @max-[640px]:py-[3px] @max-[640px]:pr-[10px]"
                >
                  <PersonAvatar
                    person={member}
                    size={30}
                    fontSize={10.5}
                    className="bg-[var(--canvas)]"
                    title={`${member.fullName} — ${hoursLabel(member.minutes)} logged`}
                  />
                  <Mono size="meta" className="hidden text-[var(--ink-muted)] @max-[640px]:inline">
                    {hoursLabel(member.minutes)}
                  </Mono>
                </span>
              ))}
              <Mono size="meta" className="ml-[6px] hidden text-[var(--ink-faint)] @[640px]:inline">
                hover for per-person load
              </Mono>
            </div>
          ) : null}
        </div>

        {/* ---- status distribution ---- */}
        <div data-reveal="section" style={{ animationDelay: "75ms" }} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              Status distribution
            </Mono>
            <Mono size="key" className="text-[var(--ink-muted)]">
              {sprint.items.length} items
            </Mono>
          </div>

          <div
            className="mt-3 flex h-[10px] overflow-hidden rounded-pill bg-[var(--canvas)]"
            role="img"
            aria-label={`Status distribution: ${slices
              .map((slice) => `${STATUS_LABEL[slice.status]} ${slice.count}`)
              .join(", ")}`}
          >
            {slices.map((slice) => (
              <span
                key={slice.status}
                title={`${STATUS_LABEL[slice.status]} — ${slice.count}`}
                style={{ width: `${slice.share}%`, background: BAR_COLOR[slice.status] }}
              />
            ))}
          </div>

          <div className="mt-[14px] flex flex-wrap gap-3">
            {slices.map((slice) => (
              <Mono key={slice.status} size="meta" className="flex items-center gap-[6px] text-[var(--ink-muted)]">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px]"
                  style={{ background: BAR_COLOR[slice.status] }}
                />
                {STATUS_LABEL[slice.status]} {slice.count}
              </Mono>
            ))}
          </div>

          <div className="mt-5 flex items-baseline gap-[10px]">
            <Mono size="metric">{hours(logged)}</Mono>
            <Mono size="key" className="text-[var(--ink-faint)]">
              / {hours(estimate)} h estimated
            </Mono>
          </div>
        </div>

        {/* ---- burn-up ---- */}
        <div data-reveal="section" style={{ animationDelay: "150ms" }} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <Mono size="meta" className="uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              Burn-up · hours logged
            </Mono>
            <Mono size="meta" className="text-[var(--ink-faint)]">
              {estimate > 0 ? Math.round((logged / estimate) * 100) : 0}%
            </Mono>
          </div>
          <BurnUp points={burn} estimateMinutes={estimate} />
        </div>
      </div>

      {/* Rendered for a lead even when the sprint has no notes: the panel is
          where notes are written, so hiding it until notes exist means there is
          nowhere to write the first ones. An engineer looking at a sprint with
          no notes still sees nothing, because for them there is nothing. */}
      {sprint.notes || canEdit ? (
        <SprintNotes
          sprintId={sprint.id}
          notes={sprint.notes ?? ""}
          notesDoc={sprint.notesDoc}
          author={sprint.notesAuthor?.fullName.split(" ")[0] ?? null}
          writtenOn={sprint.notesWrittenOn}
          canEdit={canEdit}
          people={people}
          maxImageBatch={maxImageBatch}
        />
      ) : null}
    </section>
  );
}

/**
 * Cumulative hours logged against the estimate line.
 *
 * `viewBox="0 0 300 108"` from the bundle. The aria-label names the actual
 * series values — a chart whose label says "a chart" is not accessible, it is
 * just labelled.
 */
function BurnUp({ points, estimateMinutes }: { points: BurnPoint[]; estimateMinutes: number }) {
  if (points.length < 2) {
    return (
      <p className="mt-3 text-[12.5px] text-[var(--ink-faint)]">
        No burn-up yet — this sprint has no window set.
      </p>
    );
  }

  const width = 300;
  // `top` is the estimate line, not the top of the box. It leaves headroom for
  // the "46.0 est" label that sits above it — at 8px type the ascenders need
  // ~6px, and a baseline any higher renders the label half-clipped by the
  // viewBox with nothing in the DOM to suggest anything is wrong.
  const top = 14;
  const baseline = 96;
  const ceiling = Math.max(estimateMinutes, ...points.map((p) => p.cumulativeMinutes), 1);

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (minutes: number) => baseline - (minutes / ceiling) * (baseline - top);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.cumulativeMinutes).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${baseline} L0 ${baseline} Z`;
  const last = points[points.length - 1];

  // One label every other day when the window is long, so they never collide.
  const labelStep = points.length > 8 ? Math.ceil(points.length / 6) : 1;

  return (
    <svg
      viewBox="0 0 300 108"
      className="mt-3 h-auto w-full"
      role="img"
      aria-label={`Cumulative hours logged: ${points
        .map((p) => hours(p.cumulativeMinutes))
        .join(", ")} against ${hours(estimateMinutes)} estimated`}
    >
      <defs>
        <linearGradient id="burnGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2B57FF" />
          <stop offset="1" stopColor="#21E2C6" />
        </linearGradient>
      </defs>

      <line x1="0" y1={top} x2={width} y2={top} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="3 4" />
      <text x={width} y={top - 4} textAnchor="end" fill="var(--ink-faint)" fontFamily="JetBrains Mono, monospace" fontSize="8">
        {hours(estimateMinutes)} est
      </text>

      <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="var(--hairline-strong)" strokeWidth="1" />

      <path d={area} fill="rgba(43,87,255,0.10)" />
      <path d={line} fill="none" stroke="url(#burnGrad)" strokeWidth="2" />
      <circle cx={x(points.length - 1)} cy={y(last.cumulativeMinutes)} r="3" fill="#21E2C6" />

      {points.map((point, i) =>
        i % labelStep === 0 ? (
          <text
            key={point.date}
            x={x(i)}
            y="106"
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fill="var(--ink-faint)"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
          >
            {point.label}
          </text>
        ) : null
      )}
    </svg>
  );
}
