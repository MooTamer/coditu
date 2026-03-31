import { RevealAnimated } from "@/components/landing/reveal-animated";
import { SectionHeading } from "@/components/landing/section-heading";
import { SectionShell } from "@/components/landing/section-shell";
import { Badge } from "@/components/ui/badge";

const stack = ["SPFx", "React", "TypeScript", "Fluent UI"];

export function EvimPreview() {
  return (
    <SectionShell
      id="evim-preview"
      className="pt-8 sm:pt-12"
      containerClassName="max-w-[86rem]"
    >
      <SectionHeading
        eyebrow="Client Preview"
        title="EVIM (Germany): SharePoint Online Components"
        description="Company-specific reusable SharePoint Online components aligned with EVIM internal workflows and the modern UI experience."
      />

      <RevealAnimated>
        <article className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[linear-gradient(145deg,#f7fbff_0%,#eaf2ff_52%,#f7faff_100%)] p-4 shadow-[0_30px_70px_-50px_rgba(15,23,42,0.5)] ">
          <div className="pointer-events-none absolute -left-24 top-0 h-52 w-52 rounded-full bg-sky-200/40 blur-3xl" />

          <div className="relative space-y-5 lg:space-y-6">
            <figure className="rounded-[1.55rem] border border-white/75 bg-white/90 shadow-[0_24px_44px_-34px_rgba(15,23,42,0.45)]">
              <div
                role="img"
                aria-label="EVIM SharePoint module screenshot"
                className="relative aspect-video overflow-hidden rounded-[1.1rem] border border-black/10 bg-cover bg-top bg-no-repeat sm:aspect-[16/8] lg:aspect-[16/7]"
                style={{ backgroundImage: "url('/banner.webp')" }}
              >
                <span className="sr-only">EVIM SharePoint module screenshot</span>
              </div>
            </figure>

            <div className="flex flex-wrap gap-2 px-1">
              <Badge
                variant="secondary"
                className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px]"
              >
                EVIM Internal Experience
              </Badge>
              {stack.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className="rounded-full border-black/10 bg-white/80 px-3 py-1 text-[11px]"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </article>
      </RevealAnimated>
    </SectionShell>
  );
}
