import "server-only";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * The sign-up allowlist.
 *
 * Read through the caller's own session, so RLS decides what comes back: the
 * policy is `admin` only, and a lead or engineer gets an empty list rather than
 * a filtered one. That is the intended answer, not a bug — the page above it
 * checks the role and says so in words.
 */
export interface AllowedEmail {
  email: string;
  note: string | null;
  invitedBy: string | null;
  createdAt: string;
  /**
   * Whether somebody has actually SIGNED IN with this address yet.
   *
   * Not "does an account exist". Since `sendInvitation` an account exists from
   * the moment the invitation is sent, so the two questions came apart and this
   * is the one worth showing: an invitation nobody has opened is still
   * outstanding. `allowlist_claimed()` answers it from `last_sign_in_at`.
   */
  claimed: boolean;
}

export async function getAllowlist(): Promise<AllowedEmail[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") return [];

  const supabase = await createClient();

  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase
      .from("allowed_emails")
      .select("email, note, created_at, invited_by")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const names = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));

  // Who has actually used their invite. `auth.users` is not readable from here,
  // so this asks the question the app can answer: is there a profile whose
  // account was created for this address? The admin client could read
  // `auth.users` directly, but reaching for service-role to render a list is
  // exactly the habit that turns one bypass into five.
  const { data: claimedRows } = await supabase.rpc("allowlist_claimed");
  const claimed = new Set(
    (claimedRows ?? []).filter((row) => row.accepted).map((row) => row.email.toLowerCase())
  );

  return (rows ?? []).map((row) => ({
    email: row.email,
    note: row.note,
    invitedBy: row.invited_by ? (names.get(row.invited_by) ?? null) : null,
    createdAt: row.created_at,
    claimed: claimed.has(row.email.toLowerCase()),
  }));
}
