import { Mono } from "@/components/coditu/mono";
import { Reveal } from "@/components/motion/reveal";

export const metadata = { title: "Import" };

export default function Page() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header">
        <h1 className="text-[22px] font-bold tracking-[-0.022em]">Import</h1>
        <p className="mt-1 max-w-[68ch] text-[13.5px] text-[var(--ink-muted)]">The Notion CSV importer, with a preview that flags every unmatched value before anything is committed.</p>
      </Reveal>
      <Reveal tier="section" delay={0.075} className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-6">
        <Mono size="meta" className="text-[var(--ink-faint)]">Lands in step 10 — see docs/06-PROGRESS.md.</Mono>
      </Reveal>
    </main>
  );
}
