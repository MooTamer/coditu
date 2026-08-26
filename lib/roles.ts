/**
 * What each role may do, written down once.
 *
 * ## This is documentation, and it is allowed to be
 *
 * Nothing reads this matrix to make a decision. Every rule in it is enforced
 * somewhere real — an RLS policy, a trigger, or a check inside a Server Action —
 * and a second copy that *did* decide anything would be a second place for the
 * answer to drift.
 *
 * What it is for is the question the design's `Roles & permissions` tab exists
 * to answer: *what am I actually allowed to do here?* Today that is discoverable
 * only by trying something and reading the refusal, which is a bad way to find
 * out you cannot invite anybody.
 *
 * So each row names **where the rule really lives**. When somebody changes a
 * policy and this table goes stale, the note beside it is what tells the next
 * reader which of the two is the truth.
 */

export type Role = "admin" | "lead" | "engineer";

export const ROLES: readonly Role[] = ["admin", "lead", "engineer"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  lead: "Lead",
  engineer: "Engineer",
};

export interface Capability {
  what: string;
  admin: boolean;
  lead: boolean;
  engineer: boolean;
  /** Where the rule is actually enforced. Not prose — a path. */
  enforcedBy: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    what: "Read every project, sprint and story",
    admin: true,
    lead: true,
    engineer: true,
    enforcedBy: "is_active_member() — every internal table",
  },
  {
    what: "Log time against a story",
    admin: true,
    lead: true,
    engineer: true,
    enforcedBy: "time_entries policies",
  },
  {
    what: "Comment, and withdraw their own comment",
    admin: true,
    lead: true,
    engineer: true,
    enforcedBy: "comments policies · edit own comment",
  },
  {
    what: "Tick an acceptance criterion",
    admin: true,
    lead: true,
    engineer: true,
    enforcedBy: "assignee, reviewer, admin or lead — acceptance_criteria policies",
  },
  {
    what: "Create and move work items",
    admin: true,
    lead: true,
    engineer: false,
    enforcedBy: "guard_work_item_privilege_columns",
  },
  {
    what: "Open, close and rename sprints",
    admin: true,
    lead: true,
    engineer: false,
    enforcedBy: "sprints policies · leads write sprints",
  },
  {
    what: "Create clients and projects, rename and archive them",
    admin: true,
    lead: true,
    engineer: false,
    enforcedBy: "projects policies · leads insert/update projects",
  },
  {
    what: "See who can sign up, and invite them",
    admin: true,
    lead: false,
    engineer: false,
    enforcedBy: "allowed_emails policies · admins only",
  },
  {
    what: "Change somebody's role, capacity or access",
    admin: true,
    lead: false,
    engineer: false,
    enforcedBy: "guard_profile_privilege_columns + lib/actions/profiles.ts",
  },
  {
    what: "Issue a temporary password",
    admin: true,
    lead: false,
    engineer: false,
    enforcedBy: "lib/actions/profiles.ts · admin only, never for yourself",
  },
  {
    what: "See which client contacts exist",
    admin: true,
    lead: true,
    engineer: false,
    enforcedBy: "client_contacts policies · /app/clients answers notFound() for an engineer",
  },
  {
    what: "Grant or revoke what a client can see",
    admin: true,
    lead: false,
    engineer: false,
    enforcedBy: "client_project_grants policies · admins write client grants",
  },
  {
    what: "Read the access history",
    admin: true,
    lead: true,
    engineer: false,
    enforcedBy: "access_events policies · admins and leads read access history",
  },
  {
    what: "See their own earnings",
    admin: true,
    lead: true,
    engineer: true,
    enforcedBy: "earnings are per person — tests/earnings-boundary.test.ts",
  },
  {
    what: "See everybody's payouts",
    admin: true,
    lead: false,
    engineer: false,
    enforcedBy: "sprint_payouts policies",
  },
];

/**
 * The three rules that are not on the matrix because they are not about a role.
 *
 * Every one is enforced in `lib/actions/profiles.ts` rather than in a policy,
 * for a reason the file states: none of them is expressible as "which rows may
 * this session touch". They are stated on the page because the only other way
 * to find them out is to try, and two of the three are the misclick they exist
 * to prevent.
 */
export const SAFETY_RULES: ReadonlyArray<{
  label: string;
  /**
   * The design draws these amber / rose / jade. This design system has three
   * chip pairs — amber, jade and slate — each with measured contrast, and no
   * rose one. Adding a fourth to match a prototype would be a design-system
   * change to carry a distinction the LABELS already make, so the three that
   * exist are used: slate for the rule that is a courtesy, amber for the one
   * that is a hard stop, jade for the one that is reassurance.
   */
  tone: "amber" | "jade" | "slate";
  body: string;
}> = [
  {
    label: "Self-protection",
    tone: "slate",
    body: "You cannot change your own role or deactivate yourself. Both controls stay visible and say why — an admin who demotes themselves has escalated nothing, but it takes a second person to undo.",
  },
  {
    label: "Last admin",
    tone: "amber",
    body: "The final active admin cannot be demoted, deactivated, or given a temporary password. A workspace with no admin has no way back in: nobody can invite, nobody can promote, and the fix is a SQL console.",
  },
  {
    label: "Nothing disappears",
    tone: "jade",
    body: "Deactivation keeps comments, time entries and payout shares. A person is merged, never deleted — deleting a profile would cascade to the work it is attached to.",
  },
];
