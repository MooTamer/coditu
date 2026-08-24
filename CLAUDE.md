# Coditu

This repository is the whole of Coditu's software surface: the public marketing site at `/` and
an authenticated internal delivery app at `/app` that the team uses to run its own sprints. One
Next.js project, one design system, one deployment. The repo was formerly named *Strukture Digital*;
that name is retired and must not appear anywhere in code, copy, metadata, or assets.

## Read `docs/06-PROGRESS.md` before doing anything else.

It is the ledger. It records which of the fourteen steps in `docs/coditu-implementation-prompt.md` §13
are done, the commit that completed each, and the command that proved it. Trust it over your own
recollection, and over anything this file implies.

## Commands

```bash
npm run dev         # next dev
npm run build       # next build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run db:migrate  # supabase migration up
npm run db:seed     # seed the local database
npm run db:test     # RLS assertions, positive and negative
```

## The five invariants

These are not guidelines. Any change that breaks one of them is a bug, regardless of what it enables.

1. **A work item belongs to a sprint; a sprint belongs to a project; a project belongs to a client.**
   Nothing is global. No query, view, export, or report may return an item outside the active
   project's scope. Every server action that touches an item re-derives the project from the item's
   own sprint — never from client-supplied state.
2. **Time is stored as integer minutes, never floating hours.** `time_entries.minutes int`.
   `work_items.minutes_logged int` is a trigger-maintained rollup. Hours are a *presentation*
   concern: divide by 60 at the render edge only. Summing floats drifts, and this app's whole
   credibility is its sums.
3. **Every mutation is a Server Action:** zod-validate → re-check authorization server-side → write →
   revalidate. The browser never holds a privileged key.
4. **Optimistic updates always have a rollback path and a visible error.** A failed write that
   silently reverts is worse than no optimism.
5. **Dates: `date` columns are calendar dates with no timezone; everything else is `timestamptz`.**
   Render in `Africa/Cairo`. Never `new Date("2026-08-23")` — that parses as UTC midnight and shows
   the previous day in half the world.

## Where things are written down

| File | What lives there |
|---|---|
| `docs/06-PROGRESS.md` | **The ledger.** Step status, completing commit, verification command. Read first, update in the same commit as the work. |
| `docs/00-CONTEXT.md` | Who Coditu is, the real work, the team, the voice rules, the things that must never ship. |
| `docs/01-DESIGN-SYSTEM.md` | Tokens, chip pairs, grouping hues, type, geometry, motion tiers, the accessibility contract. |
| `docs/02-DATA-MODEL.md` | Schema, enums, triggers, views, indexes, RLS policies, the invariants restated as SQL obligations. |
| `docs/03-APP-SPEC.md` | Every screen and every behaviour the design bundle could only gesture at. |
| `docs/04-EXPORT-SPEC.md` | The CSV, Markdown, and PDF contracts, exactly. |
| `docs/05-DECISIONS.md` | Append-only ADR log. Every call the brief did not make for us, with the reason and what was rejected. |
| `docs/07-FIELD-NOTES.md` | **The shared memory.** Traps this repo has already paid for — the build that points at production, the proxy that caches after a reset, the guard that is an allowlist written as a denylist. Read it before debugging anything environmental, and append what the next person will need. |
| `docs/coditu-implementation-prompt.md` | The original contract. Superseded only by `05-DECISIONS.md`. |
| `docs/coditu-revamp-prompt.md` | The earlier brief the designs were built from. Source for voice, positioning, and company facts. |
| `design/` | The approved Claude Design bundle, committed verbatim. Five artboards. Prototypes, not code. |

## How to work here

- Work one step of `docs/coditu-implementation-prompt.md` §13 at a time. Do not start the next before
  the current one's verification command is green.
- A task is only `done` when its verification command passes. Update `docs/06-PROGRESS.md` in the same
  commit as the work, never in a separate "update docs" commit.
- Commit small. Every commit builds.
- When the brief conflicts with the design bundle on a **number**, the bundle wins. On **behaviour**,
  the brief wins. On **correctness**, correctness wins and you record it in `docs/05-DECISIONS.md`.
- Ask before changing the data model, the export contract, or the auth model in a way the brief does
  not describe.
- Do not add features that are not in the brief. No epics, no story points, no workflow engine, no
  custom fields, no roadmap. Restraint is the design.
