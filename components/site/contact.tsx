import { ArrowRight } from "lucide-react";

import { CoditusLockup } from "@/components/coditu/coditus-mark";
import { SignalRule, SiteContainer } from "@/components/site/shell";
import { contact } from "@/lib/marketing-content";

/**
 * The contact block, which is also the footer. One card rather than a band of
 * links: the only thing we want from this page is an email, so the email is
 * the largest thing on it.
 */
export function Contact() {
  return (
    <footer
      id="contact"
      data-trace-section="Contact"
      aria-labelledby="contact-title"
      className="section-anchor pt-[clamp(56px,6vw,96px)] pb-14"
    >
      <SiteContainer>
        <div className="overflow-hidden rounded-section border border-hairline-strong bg-raised">
          <div className="grid items-end gap-10 p-[clamp(28px,4vw,56px)] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
            <div>
              <SignalRule
                gradientId="footRule"
                viewBox="0 0 400 20"
                length={420}
                d="M0 16 L240 16 C280 16 280 4 320 4 L400 4"
                className="mb-7 h-5 max-w-[400px]"
              />

              <h2
                id="contact-title"
                className="max-w-[22ch] text-h1 leading-[1.08] font-bold tracking-[-0.028em]"
              >
                {contact.heading}
              </h2>

              <p className="mt-[18px] max-w-[48ch] text-base leading-[1.6] text-ink-muted">
                {contact.body}
              </p>

              <a
                href={`mailto:${contact.email}`}
                className="signal-gradient mt-7 inline-flex h-[52px] items-center gap-3 rounded-control px-6 text-base font-semibold text-[#07090E]"
              >
                {contact.email}
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
              </a>
            </div>

            <div className="grid gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
              <nav aria-label="Site sections">
                <p className="font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
                  Navigate
                </p>
                <div className="mt-3.5 flex flex-col text-[15px] text-ink-muted">
                  {contact.navigate.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex min-h-11 items-center hover:text-ink"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </nav>

              <div>
                <p className="font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">
                  Contact
                </p>
                <div className="mt-3.5 flex flex-col gap-2.5 text-[15px] text-ink-muted">
                  <span>{contact.email}</span>
                  <span>{contact.locations}</span>
                  <span>{contact.offer}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-5 border-t border-hairline px-[clamp(28px,4vw,56px)] py-[22px]">
            <CoditusLockup markSize={24} />
            <span className="font-mono text-[11.5px] text-ink-faint">{contact.colophon}</span>
          </div>
        </div>
      </SiteContainer>
    </footer>
  );
}
