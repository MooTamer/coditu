import { THREAD_STATE_LABEL, type ClientThreadState } from "@/lib/client-threads";

/**
 * Whose turn it is, in words.
 *
 * Amber for "we need something from you", quiet for "we have it". The colour is
 * doing the same job the amber highlight does on a sprint note — it marks the
 * one thing that needs a person, and it is deliberately the only amber on the
 * screen so that it means something.
 */
const TONE: Record<ClientThreadState, string> = {
  waiting_client: "bg-[var(--tone-amber-bg)] text-[var(--tone-amber-fg)]",
  waiting_coditu: "bg-[var(--tone-slate-bg)] text-[var(--tone-slate-fg)]",
  resolved: "bg-[var(--tone-jade-bg)] text-[var(--tone-jade-fg)]",
};

export function ThreadStateChip({ state }: { state: ClientThreadState }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip px-2 py-[3px] text-[12px] font-medium ${TONE[state]}`}
    >
      {THREAD_STATE_LABEL[state]}
    </span>
  );
}
