import { staggerDelay } from "@/lib/motion";
import { SectionHead, SiteSection } from "@/components/site/shell";
import { deliveryNotes, process, services, team, useCases } from "@/lib/marketing-content";

/**
 * Everything between the work gallery and the FAQ.
 *
 * All Server Components: none of these has behaviour, so none of them costs
 * the reader a byte of JavaScript. They share one file because they share one
 * shape — a numbered rule, then a grid — and splitting five twenty-line
 * components across five files makes the shape harder to see, not easier.
 *
 * Motion is the `section` tier — 18px, 14px blur, 520ms — applied to the grid
 * CHILDREN in a stagger rather than to the section as one block. §4's blur rule
 * is the reason: `filter: blur()` costs an offscreen composite pass every
 * frame, and a section is far taller than the 40vh ceiling for blurring a
 * single element. `staggerDelay` caps the whole sequence at 600ms no matter how
 * many children there are.
 */

export function Services() {
  return (
    <SiteSection id="services" label="Services">
      <SectionHead id="services-title" n="02" title="What we build" meta="Discovery → iteration" />

      <div className="mt-8 grid gap-px overflow-hidden rounded-section border border-hairline bg-hairline [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {services.map((service, index) => (
          <div
            key={service.n}
            data-reveal="section"
            data-reveal-on-view
            style={{ animationDelay: `${staggerDelay(index, services.length) * 1000}ms` }}
            className="flex min-h-[216px] flex-col gap-4 bg-raised p-7 transition-colors duration-[220ms] hover:bg-overlay"
          >
            <div className="font-mono text-[11px] text-ink-faint">{service.n}</div>
            <h3 className="text-[19px] font-bold tracking-[-0.015em]">{service.title}</h3>
            <ul className="mt-0.5 flex flex-col gap-2">
              {service.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2.5 text-sm leading-[1.5] text-ink-muted">
                  <span className="mt-2.5 h-px w-3.5 shrink-0 bg-accent" aria-hidden />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SiteSection>
  );
}

export function Process() {
  return (
    <SiteSection id="process" label="Process">
      <SectionHead id="process-title" n="03" title="How the work runs" />

      {/* The rail is a decoration on top of a real ordered list. It is absolute
          and `aria-hidden`; the semantics live in the <ol>. */}
      <div className="relative mt-10 pl-8 sm:pl-12">
        <svg
          viewBox="0 0 24 600"
          preserveAspectRatio="none"
          className="absolute top-2 left-1.5 h-[calc(100%-16px)] w-6"
          fill="none"
          aria-hidden
        >
          <path d="M12 0 L12 600" stroke="var(--hairline-strong)" strokeWidth="1" />
          <path
            className="cd-draw"
            style={{ "--len": 600 } as React.CSSProperties}
            d="M12 0 L12 600"
            stroke="url(#procGrad)"
            strokeWidth="1.5"
            strokeDasharray="600"
          />
          <defs>
            <linearGradient id="procGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--signal-from)" />
              <stop offset="1" stopColor="var(--signal-to)" />
            </linearGradient>
          </defs>
        </svg>

        <ol className="flex flex-col">
          {process.map((step, index) => (
            <li
              key={step.n}
              data-reveal="section"
              data-reveal-on-view
              style={{ animationDelay: `${staggerDelay(index, process.length) * 1000}ms` }}
              className="relative grid gap-2 border-b border-hairline py-[22px] sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:gap-6"
            >
              <span
                aria-hidden
                className="absolute top-7 -left-8 size-[11px] rounded-pill border-[1.5px] border-[var(--signal-to)] bg-[var(--canvas)] sm:-left-12"
              />
              <span className="flex items-baseline gap-3.5">
                <span className="font-mono text-xs text-ink-faint">{step.n}</span>
                <span className="text-[19px] font-bold tracking-[-0.015em]">{step.title}</span>
              </span>
              <span className="max-w-[62ch] text-[15px] leading-[1.55] text-ink-muted">
                {step.body}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </SiteSection>
  );
}

export function UseCases() {
  return (
    <SiteSection id="use-cases" label="Use cases">
      <SectionHead id="use-cases-title" n="04" title="Who we work with" />

      <div className="mt-7 grid gap-x-8 gap-y-5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {useCases.map((useCase, index) => (
          <div
            key={useCase.title}
            data-reveal="section"
            data-reveal-on-view
            style={{ animationDelay: `${staggerDelay(index, useCases.length) * 1000}ms` }}
            className="flex flex-col gap-2 border-t border-hairline pt-[18px]"
          >
            <h3 className="text-base font-bold">{useCase.title}</h3>
            <p className="text-sm leading-[1.5] text-ink-muted">{useCase.body}</p>
            <p className="mt-1 font-mono text-[11px] tracking-[0.05em] text-accent uppercase">
              {useCase.outcome}
            </p>
          </div>
        ))}
      </div>
    </SiteSection>
  );
}

export function Team() {
  return (
    <SiteSection id="team" label="Team">
      <SectionHead id="team-title" n="05" title="The team" meta="Two hubs · daily overlap" />

      <div className="mt-8 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <div className="flex min-h-[300px] flex-col justify-between gap-6 rounded-section border border-hairline bg-raised p-7">
          <div>
            <p className="font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
              Distributed by design
            </p>
            <p className="mt-3.5 max-w-[34ch] text-[15px] leading-[1.55] text-ink-muted">
              Munich and Ulm cover the client day; Cairo carries the build. The handoff happens
              live, not in a ticket queue.
            </p>
          </div>

          <svg
            viewBox="0 0 420 150"
            className="h-auto w-full"
            fill="none"
            role="img"
            aria-label="Germany and Egypt, connected across the working day"
          >
            <path
              className="cd-draw"
              style={{ "--len": 260 } as React.CSSProperties}
              d="M96 52 C 170 52 210 108 292 108"
              stroke="url(#arcGrad)"
              strokeWidth="1.5"
              strokeDasharray="260"
            />
            <circle cx="96" cy="52" r="14" fill="color-mix(in srgb, var(--signal-from) 18%, transparent)" className="cd-pulse" />
            <circle cx="96" cy="52" r="4.5" fill="var(--signal-from)" />
            <circle cx="292" cy="108" r="14" fill="color-mix(in srgb, var(--signal-to) 16%, transparent)" className="cd-pulse" />
            <circle cx="292" cy="108" r="4.5" fill="var(--signal-to)" />
            <text x="96" y="30" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-jetbrains), monospace" fontSize="11">
              GERMANY
            </text>
            <text x="292" y="136" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-jetbrains), monospace" fontSize="11">
              EGYPT
            </text>
            <defs>
              <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--signal-from)" />
                <stop offset="1" stopColor="var(--signal-to)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {team.map((member, index) => (
          <div
            key={member.name}
            data-reveal="section"
            data-reveal-on-view
            style={{ animationDelay: `${staggerDelay(index + 1, team.length + 1) * 1000}ms` }}
            className="flex flex-col gap-4 rounded-section border border-hairline bg-raised p-[26px] transition-colors duration-[220ms] hover:border-hairline-strong"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-control border border-hairline-strong font-mono text-[13px] text-ink"
              >
                {member.initials}
              </span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-accent uppercase">
                {member.base}
              </span>
            </div>
            <div>
              <h3 className="text-[17px] font-bold tracking-[-0.015em]">{member.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{member.role}</p>
            </div>
            <ul className="mt-auto flex flex-col gap-1.5">
              {member.specialties.map((specialty) => (
                <li key={specialty} className="font-mono text-[11.5px] text-ink-faint">
                  {specialty}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SiteSection>
  );
}

/**
 * Delivery notes are positions, not articles — there is no blog behind them.
 * They render as plain cards rather than links: a link promising a page we
 * have not written is the same category of lie as an invented testimonial.
 */
export function DeliveryNotes() {
  return (
    <SiteSection id="insights" label="Notes">
      <SectionHead id="insights-title" n="06" title="Delivery notes" />

      <div className="mt-8 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {deliveryNotes.map((note, index) => (
          <article
            key={note.title}
            data-reveal="section"
            data-reveal-on-view
            style={{ animationDelay: `${staggerDelay(index, deliveryNotes.length) * 1000}ms` }}
            className="flex flex-col gap-3.5 border-t border-hairline-strong pt-5"
          >
            <p className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
              <span className="text-accent">{note.topic}</span>
              <span aria-hidden>·</span>
              <span>{note.read}</span>
            </p>
            <h3 className="max-w-[26ch] text-xl leading-[1.25] font-bold tracking-[-0.018em]">
              {note.title}
            </h3>
            <p className="text-sm leading-[1.55] text-ink-muted">{note.excerpt}</p>
          </article>
        ))}
      </div>
    </SiteSection>
  );
}
