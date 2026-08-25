import "server-only";

import { cache } from "react";

import type { ClientCapability } from "@/lib/client-access";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";

/**
 * What an admin sees on `/app/clients` — who has access to what.
 *
 * The internal side of the portal, so these are ordinary `.from()` reads with
 * ordinary policies: `client_contacts` and `client_project_grants` are readable
 * by any active internal member, and `client_invitations` only by an admin.
 * There is no `security definer` anywhere in this file and there should not be
 * — the column-projection problem that made the CLIENT read model a set of RPCs
 * does not exist here, because every column on these tables is one an admin may
 * see.
 */

export interface ClientGrantRow {
  projectId: string;
  projectName: string;
  projectSlug: string;
  capabilities: ClientCapability[];
  revokedAt: string | null;
}

export interface ClientContactRow {
  profileId: string;
  fullName: string;
  initials: string;
  status: "invited" | "active" | "revoked";
  invitedAt: string;
  acceptedAt: string | null;
  grants: ClientGrantRow[];
}

export interface PendingInvitationRow {
  id: string;
  email: string;
  capabilities: ClientCapability[];
  expiresAt: string;
  createdAt: string;
  /** Past `expires_at` and never claimed. Shown, not hidden — it needs an action. */
  isExpired: boolean;
  projectNames: string[];
}

export interface ClientAccessRow {
  clientId: string;
  clientName: string;
  projects: { id: string; name: string; slug: string }[];
  contacts: ClientContactRow[];
  invitations: PendingInvitationRow[];
}

/**
 * Every client company, its projects, its contacts and its outstanding
 * invitations.
 *
 * One query per table rather than one nested select, and joined here. The
 * nested form would need `client_project_grants` to hang off `client_contacts`
 * off `clients`, which PostgREST can express but which makes the shape depend
 * on an FK chain that is about to grow; four flat reads are cheaper to keep
 * right and this page is not on a hot path.
 */
export const listClientAccess = cache(async (): Promise<ClientAccessRow[]> => {
  const profile = await getCurrentProfile();
  // Not the boundary — RLS is — but a lead reading this page should get an
  // empty invitations list rather than a policy error in the console.
  if (!profile) return [];

  const supabase = await createClient();

  const [clients, projects, contacts, grants, invitations, invitationProjects] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("projects").select("id, client_id, name, slug").order("name"),
    supabase
      .from("client_contacts")
      // The embed is hinted, and it has to be: `client_contacts` has TWO
      // foreign keys into `profiles` — `profile_id` (the contact) and
      // `invited_by` (the admin who invited her) — so an unqualified
      // `profiles (…)` is ambiguous and PostgREST refuses to guess.
      .select(
        "profile_id, client_id, status, invited_at, accepted_at, profiles!client_contacts_profile_id_fkey ( full_name, initials )"
      )
      .order("invited_at"),
    supabase
      .from("client_project_grants")
      .select("contact_profile_id, project_id, capabilities, revoked_at"),
    profile.role === "admin"
      ? supabase
          .from("client_invitations")
          .select("id, email, client_id, capabilities, status, expires_at, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    profile.role === "admin"
      ? supabase.from("client_invitation_projects").select("invitation_id, project_id")
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [clients, projects, contacts, grants, invitations, invitationProjects]) {
    if (result.error) throw result.error;
  }

  const projectById = new Map((projects.data ?? []).map((p) => [p.id, p]));

  return (clients.data ?? []).map((client) => {
    const own = (projects.data ?? []).filter((p) => p.client_id === client.id);

    return {
      clientId: client.id,
      clientName: client.name,
      projects: own.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),

      contacts: (contacts.data ?? [])
        .filter((c) => c.client_id === client.id)
        .map((c) => ({
          profileId: c.profile_id,
          fullName: c.profiles?.full_name ?? "—",
          initials: c.profiles?.initials ?? "—",
          status: c.status as ClientContactRow["status"],
          invitedAt: c.invited_at,
          acceptedAt: c.accepted_at,
          grants: (grants.data ?? [])
            .filter((g) => g.contact_profile_id === c.profile_id)
            .map((g) => ({
              projectId: g.project_id,
              projectName: projectById.get(g.project_id)?.name ?? "—",
              projectSlug: projectById.get(g.project_id)?.slug ?? "",
              capabilities: (g.capabilities ?? []) as ClientCapability[],
              revokedAt: g.revoked_at,
            }))
            .sort((a, b) => a.projectName.localeCompare(b.projectName)),
        })),

      invitations: (invitations.data ?? [])
        .filter((i) => i.client_id === client.id)
        .map((i) => ({
          id: i.id,
          email: i.email,
          capabilities: (i.capabilities ?? []) as ClientCapability[],
          expiresAt: i.expires_at,
          createdAt: i.created_at,
          // Computed here rather than filtered away in the query. An expired
          // invitation is not noise — it is a thing somebody has to withdraw or
          // reissue, and hiding it leaves an address that can still be claimed
          // looking like it was never invited.
          isExpired: new Date(i.expires_at).getTime() < Date.now(),
          projectNames: (invitationProjects.data ?? [])
            .filter((ip) => ip.invitation_id === i.id)
            .map((ip) => projectById.get(ip.project_id)?.name ?? "—")
            .sort(),
        })),
    };
  });
});
