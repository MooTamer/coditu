import { Reveal } from "@/components/motion/reveal";
import { getClientContact } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

/** The first name, for a greeting. "Cara Contact" → "Cara"; one word stays whole. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * The client overview.
 *
 * Right now it has exactly one honest thing to say. Project grants do not exist
 * yet — they arrive with the access tables — so every contact who signs in is
 * genuinely in the "nothing shared with me yet" state, and this renders that
 * state rather than an empty dashboard pretending to be a full one.
 *
 * The copy matters more than usual here. This is the first screen a client sees
 * after being handed a password by somebody at Coditu, and the failure mode is
 * that it reads like an error. It is not an error: it is a setup step that has
 * not finished, and the sentence says so and says who is doing it.
 */
export default async function ClientOverviewPage() {
  // The layout has already established there is one; this is the same
  // request-scoped read, not a second round trip worth avoiding.
  const contact = await getClientContact();
  if (!contact) return null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-[var(--app-gutter)]">
      {/* No eyebrow. The internal screens carry one because they sit inside a
          rail full of other sections and it says which you are on; here the
          wordmark is sixty pixels above the heading and a second "Coditu"
          under it is furniture. */}
      <Reveal tier="section" as="header">
        <h1 className="text-[26px] font-bold tracking-[-0.024em]">
          Hello, {firstName(contact.full_name)}.
        </h1>
      </Reveal>

      <Reveal tier="section" delay={0.06} as="section" aria-labelledby="nothing-yet">
        <div className="max-w-[62ch] rounded-section border border-[var(--hairline)] bg-[var(--raised)] p-5">
          <h2 id="nothing-yet" className="text-[16px] font-bold tracking-[-0.015em]">
            Your access is still being set up
          </h2>
          <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
            Nothing has been shared with you yet. When the Coditu team publishes work on your
            projects, it will appear here — what moved this week, where each piece of the build has
            got to, and anything we need your input on.
          </p>
          <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--ink-muted)]">
            You do not need to do anything. Whoever invited you will let you know when it is ready.
          </p>
        </div>
      </Reveal>
    </main>
  );
}
