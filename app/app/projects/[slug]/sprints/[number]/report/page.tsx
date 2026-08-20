import { notFound } from "next/navigation";

import { CoditusMark } from "@/components/coditu/coditus-mark";
import { buildExportPayload, itemsByStatusOrder } from "@/lib/data/export";
import { getBurnUp } from "@/lib/data/sprint";
import { calendarDate, hours } from "@/lib/format";
import { STATUS_DISPLAY_ORDER, STATUS_LABEL_CLIENT, type WorkItemStatus } from "@/lib/work-items";

import "./report.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const payload = await buildExportPayload(slug, Number(number), null);
  return {
    title: payload ? `${payload.project.clientName} · Sprint ${number} report` : "Sprint report",
    robots: { index: false, follow: false },
  };
}

/** Bar colours. The client never sees a status label they would have to decode. */
const BAR: Record<WorkItemStatus, string> = {
  dev_started: "#2B57FF",
  ready_for_peer_review: "#FFB020",
  in_review: "#21E2C6",
  changes_requested: "#FF5F6D",
  todo: "#6B7A90",
  draft: "rgba(107,122,144,0.35)",
  blocked: "#FF5F6D",
  done: "#23C97F",
};

/**
 * The client sprint report.
 *
 * One layout, two outputs: this page IS the PDF. `…/report/pdf` drives headless
 * Chromium over this same URL, so the screen preview cannot drift from the file
 * a client receives.
 *
 * Client-facing means client-facing. No internal comments, no activity log, no
 * reviewer names, no per-person hours, and no `COD-` keys — the design bundle
 * shows the keys, but the brief is explicit that they do not belong here, and
 * on behaviour the brief wins. Statuses are humanised: a client reading
 * "ready_for_peer_review" in a document prepared for them is a mistake, not a
 * style choice.
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; number: string }>;
  searchParams: Promise<{ items?: string }>;
}) {
  const [{ slug, number }, query] = await Promise.all([params, searchParams]);

  // The selection travels in the URL, so the PDF renderer reproduces exactly
  // what was previewed rather than re-deciding.
  const selected = query.items ? query.items.split(",").filter(Boolean) : null;

  const payload = await buildExportPayload(slug, Number(number), selected);
  if (!payload) notFound();

  const burn = await getBurnUp(payload.sprint.id, payload.sprint.startsOn, payload.sprint.endsOn);

  const logged = payload.items.reduce((total, item) => total + item.minutesLogged, 0);
  const estimate = payload.items.reduce((total, item) => total + item.estimateMinutes, 0);
  const percent = estimate > 0 ? Math.round((logged / estimate) * 100) : 0;

  const counts = new Map<WorkItemStatus, number>();
  for (const item of payload.items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);

  const distribution = STATUS_DISPLAY_ORDER.filter((status) => counts.has(status)).map((status) => ({
    status,
    label: STATUS_LABEL_CLIENT[status],
    count: counts.get(status)!,
    share: (counts.get(status)! / Math.max(payload.items.length, 1)) * 100,
  }));

  const ordered = itemsByStatusOrder(payload);
  const groups = STATUS_DISPLAY_ORDER.filter((status) => counts.has(status)).map((status) => ({
    status,
    label: STATUS_LABEL_CLIENT[status],
    items: ordered.filter((item) => item.status === status),
  }));

  const headerMeta = `${payload.project.clientName} · Sprint ${payload.sprint.number}`;

  return (
    <div className="report">
      {/* Screen only — a preview of the running header. In print, Chromium's
          headerTemplate does this, because `counter(page)` inside a fixed
          element renders "Page 0 of 0". */}
      <header className="report-header" aria-hidden>
        <CoditusMark size={20} standalone />
        <span className="report-wordmark">Coditu</span>
        <span className="report-header-meta">{headerMeta}</span>
      </header>

      <main className="report-body">
        <div className="report-eyebrow keep">
          <span className="report-eyebrow-text">Sprint report</span>
          <span className="report-rule" />
        </div>

        <p className="report-prepared">
          Prepared for {payload.project.clientName}
          {payload.project.clientUrl
            ? ` · ${payload.project.clientUrl.replace(/^https?:\/\/(www\.)?/, "")}`
            : ""}
        </p>

        <h1 className="report-title">{payload.sprint.name}</h1>

        <p className="report-intro">
          This is where {payload.project.name} stands at the end of the sprint window: what was
          worked on, how the hours landed against the estimate, and what each item still needs.
        </p>

        <section className="report-stats keep" aria-label="Summary">
          <Stat label="Items in report" value={String(payload.items.length)} />
          <Stat label="Hours logged" value={hours(logged)} />
          <Stat label="Of estimate" value={`${percent}%`} />
          <Stat
            label="Sprint window"
            value={`${calendarDate(payload.sprint.startsOn)} → ${calendarDate(payload.sprint.endsOn)}`}
            small
          />
        </section>

        <section className="report-section keep" aria-labelledby="glance">
          <div className="report-section-head">
            <h2 id="glance">Progress at a glance</h2>
            <span className="report-note">{percent}% of estimated hours logged</span>
          </div>

          <div
            className="report-bar"
            role="img"
            aria-label={`Status distribution: ${distribution
              .map((slice) => `${slice.label} ${slice.count}`)
              .join(", ")}`}
          >
            {distribution.map((slice) => (
              <span
                key={slice.status}
                style={{ width: `${slice.share}%`, background: BAR[slice.status] }}
              />
            ))}
          </div>

          <div className="report-legend">
            {distribution.map((slice) => (
              <span key={slice.status}>
                <span className="report-swatch" style={{ background: BAR[slice.status] }} />
                {slice.label} {slice.count}
              </span>
            ))}
          </div>

          {burn.length > 1 ? <BurnUp points={burn} estimateMinutes={estimate} /> : null}
        </section>

        <h2 className="report-heading">Where each item stands</h2>

        {groups.map((group) => (
          <section key={group.status} className="report-group" aria-label={group.label}>
            <div className="report-group-head keep">
              <span className="report-swatch" style={{ background: BAR[group.status] }} />
              <span className="report-group-label">{group.label}</span>
              <span className="report-note">{group.items.length}</span>
            </div>

            {group.items.map((item) => (
              // `break-inside: avoid` plus orphans/widows, so an item's heading
              // never ends up alone at the bottom of a page.
              <article key={item.key} className="report-item keep">
                <div className="report-item-head">
                  <h3>{item.title}</h3>
                  <span className="report-note">
                    {hours(item.minutesLogged)} / {hours(item.estimateMinutes)} h
                    {item.deadline ? ` · due ${calendarDate(item.deadline)}` : ""}
                  </span>
                </div>

                {item.description ? <p className="report-item-body">{item.description}</p> : null}

                {item.criteria.length > 0 ? (
                  <ul className="report-criteria">
                    {item.criteria.map((criterion, index) => (
                      <li key={index} className={criterion.isDone ? "is-done" : undefined}>
                        <span className="report-check" aria-hidden>
                          {criterion.isDone ? "✓" : "○"}
                        </span>
                        <span>{criterion.body}</span>
                        <span className="sr-only">
                          {criterion.isDone ? " (met)" : " (outstanding)"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>
        ))}

        <section className="report-section keep" aria-labelledby="next">
          <h2 id="next">What happens next</h2>
          <p className="report-item-body">
            {outstandingSentence(payload.items.length, groups)}
          </p>
          <p className="report-item-body">
            If anything here reads differently from your side, reply to{" "}
            <a href="mailto:hello@coditu.com">hello@coditu.com</a> and we will pick it up before the
            next sprint opens.
          </p>
        </section>
      </main>

      {/* Screen only. The printed running footer comes from Chromium's own
          template, which is the only place page numbers are populated. */}
      <footer className="report-footer" aria-hidden>
        <span>hello@coditu.com</span>
      </footer>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className={small ? "report-stat-value is-small" : "report-stat-value"}>{value}</div>
    </div>
  );
}

/** A plain sentence rather than a bullet list — this is the part a person reads. */
function outstandingSentence(
  total: number,
  groups: Array<{ status: WorkItemStatus; label: string; items: unknown[] }>
): string {
  const done = groups.find((group) => group.status === "done")?.items.length ?? 0;
  const inFlight = groups
    .filter((group) => group.status !== "done" && group.status !== "draft")
    .reduce((n, group) => n + group.items.length, 0);
  const notScoped = groups.find((group) => group.status === "draft")?.items.length ?? 0;

  const parts: string[] = [];
  if (done > 0) parts.push(`${done} of ${total} ${done === 1 ? "item is" : "items are"} finished`);
  if (inFlight > 0) parts.push(`${inFlight} ${inFlight === 1 ? "is" : "are"} still moving`);
  if (notScoped > 0) {
    parts.push(`${notScoped} ${notScoped === 1 ? "is" : "are"} not scoped yet and needs a decision from you`);
  }

  return parts.length
    ? `${parts.join(", ")}. Anything outstanding carries into the next sprint in the same order.`
    : "Everything in this report is finished.";
}

function BurnUp({
  points,
  estimateMinutes,
}: {
  points: Array<{ label: string; date: string; cumulativeMinutes: number }>;
  estimateMinutes: number;
}) {
  const width = 620;
  // `top` is the estimate line, not the top of the box. It leaves headroom for
  // the "46.0 est" label that sits above it — at 8px type the ascenders need
  // ~6px, and a baseline any higher renders the label half-clipped by the
  // viewBox with nothing in the DOM to suggest anything is wrong.
  const top = 16;
  const baseline = 104;
  const ceiling = Math.max(estimateMinutes, ...points.map((p) => p.cumulativeMinutes), 1);

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (minutes: number) => baseline - (minutes / ceiling) * (baseline - top);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.cumulativeMinutes).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${baseline} L0 ${baseline} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox="0 0 620 120"
      className="report-chart"
      role="img"
      aria-label={`Cumulative hours logged across the sprint: ${points
        .map((p) => hours(p.cumulativeMinutes))
        .join(", ")} against ${hours(estimateMinutes)} estimated`}
    >
      <defs>
        <linearGradient id="reportBurn" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2B57FF" />
          <stop offset="1" stopColor="#21E2C6" />
        </linearGradient>
      </defs>
      <line x1="0" y1={top} x2={width} y2={top} stroke="rgba(11,14,20,0.14)" strokeWidth="1" strokeDasharray="3 5" />
      <text x={width} y={top - 4} textAnchor="end" fill="#5F6B80" fontFamily="JetBrains Mono, monospace" fontSize="8">
        {hours(estimateMinutes)} est
      </text>
      <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="rgba(11,14,20,0.2)" strokeWidth="1" />
      <path d={area} fill="rgba(43,87,255,0.08)" />
      <path d={line} fill="none" stroke="url(#reportBurn)" strokeWidth="2" />
      <circle cx={x(points.length - 1)} cy={y(last.cumulativeMinutes)} r="3" fill="#21E2C6" />
      {points.map((point, i) => (
        <text
          key={point.date}
          x={x(i)}
          y="116"
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          fill="#5F6B80"
          fontFamily="JetBrains Mono, monospace"
          fontSize="8"
        >
          {point.label}
        </text>
      ))}
    </svg>
  );
}
