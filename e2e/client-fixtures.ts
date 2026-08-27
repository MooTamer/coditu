/**
 * A client contact with real access, for the portal suite.
 *
 * Built on `createThrowawayAccount` so the account goes through the real
 * `handle_new_user` trigger, then made a client account, given a company and a
 * grant, and handed one published component with published work — all the way a
 * privileged writer would, never through sign-up metadata.
 * `20260821180000_role_is_not_client_supplied.sql` is the reason that
 * distinction matters, and it applies to the account KIND at least as much as
 * to the role.
 *
 * Everything it creates is named `portal-e2e-*` or belongs to the throwaway
 * account, so `teardown()` removes exactly what it made and the seed is left
 * as it was found. The suite shares one database — `07-FIELD-NOTES.md`.
 */
import { createThrowawayAccount, query, removeThrowawayAccount } from "./fixtures";

/**
 * The boundary suite's own person, with a DIFFERENT address.
 *
 * `client-boundary.spec.ts` and `client-portal.spec.ts` are separate files, so
 * Playwright runs them in separate workers at the same time, and each one's
 * `beforeAll`/`afterAll` was creating and deleting the other's fixture
 * mid-assertion. Serial mode fixes ordering *within* a file and does nothing
 * across two. Separate rows is the fix that does not depend on scheduling.
 *
 * It needs no company, no project and no grant: the claim it makes is that a
 * client account cannot reach `/app`, which is true before any access exists.
 */
export const BOUNDARY_CONTACT = {
  email: "boundary@portal-e2e.test",
  password: "portal-e2e-password",
  fullName: "Bea Boundary",
};

export async function setupBoundaryAccount(): Promise<void> {
  await removeThrowawayAccount(BOUNDARY_CONTACT.email);
  await createThrowawayAccount(BOUNDARY_CONTACT);
  await query(
    `update public.profiles p set account_kind = 'client'
       from auth.users u where u.id = p.id and u.email = $1`,
    [BOUNDARY_CONTACT.email]
  );
}

export async function teardownBoundaryAccount(): Promise<void> {
  await removeThrowawayAccount(BOUNDARY_CONTACT.email);
}

export const CLIENT_CONTACT = {
  email: "cara@portal-e2e.test",
  password: "portal-e2e-password",
  fullName: "Cara Contact",
};

/** A second contact at a different company — the cross-client case needs two. */
export const OTHER_CONTACT = {
  email: "dana@portal-e2e.test",
  password: "portal-e2e-password",
  fullName: "Dana Other",
};

export const FIXTURE = {
  clientName: "Portal E2E Client",
  otherClientName: "Portal E2E Other Client",
  projectName: "Portal E2E Project",
  projectSlug: "portal-e2e-project",
  otherProjectSlug: "portal-e2e-other",
  sprintName: "Portal E2E — Week 1",
  publishedComponent: { name: "Published Part", slug: "published-part" },
  hiddenComponent: { name: "Hidden Part", slug: "hidden-part" },
  summary: "The part of the build this client has been shown.",
  /** Two published items, one done; plus one deliberately unpublished. */
  publishedTitles: ["Published thing one", "Published thing two"],
  hiddenTitle: "Unpublished thing",
  /** The client-safe rewrite, so the override is exercised rather than assumed. */
  rewrittenAs: "A friendlier name for the client",

  /** A question on the published component, and one on the hidden one. */
  question: "Which of these two should the banner do?",
  questionOpener: "Either is fine by us — which do you prefer?",
  hiddenQuestion: "A question about something she cannot see",
} as const;

/** Collaborator, minus hours — the default an admin would pick. */
const COLLABORATOR =
  "{view_project,view_components,view_work,view_current_sprint,view_past_sprints,view_criteria,read_questions,reply_questions}";

export async function setupClientFixture(): Promise<void> {
  await teardownClientFixture();

  await createThrowawayAccount(CLIENT_CONTACT);
  await createThrowawayAccount(OTHER_CONTACT);

  await query(
    `update public.profiles p set account_kind = 'client'
       from auth.users u where u.id = p.id and u.email in ($1, $2)`,
    [CLIENT_CONTACT.email, OTHER_CONTACT.email]
  );

  // Two companies, two projects — so "one client cannot see another" has
  // something real to leak rather than an empty set that passes either way.
  await query(
    `insert into public.clients (name) values ($1), ($2)`,
    [FIXTURE.clientName, FIXTURE.otherClientName]
  );
  await query(
    `insert into public.projects (client_id, name, slug)
     values ((select id from public.clients where name = $1), $2, $3),
            ((select id from public.clients where name = $4), $5, $6)`,
    [
      FIXTURE.clientName,
      FIXTURE.projectName,
      FIXTURE.projectSlug,
      FIXTURE.otherClientName,
      "Portal E2E Other Project",
      FIXTURE.otherProjectSlug,
    ]
  );

  await query(
    `insert into public.sprints (project_id, number, name, status, starts_on, ends_on)
     values ((select id from public.projects where slug = $1), 1, $2, 'active', current_date - 3, current_date + 3)`,
    [FIXTURE.projectSlug, FIXTURE.sprintName]
  );

  // One published component, one not. The unpublished one is the control: it
  // must be absent from the list, 404 on its own URL, and — the assertion that
  // matters most — not appear in any count.
  await query(
    `insert into public.components (project_id, name, slug, kind, client_summary, published_at)
     values ((select id from public.projects where slug = $1), $2, $3, 'react', $4, now()),
            ((select id from public.projects where slug = $1), $5, $6, 'react', null, null)`,
    [
      FIXTURE.projectSlug,
      FIXTURE.publishedComponent.name,
      FIXTURE.publishedComponent.slug,
      FIXTURE.summary,
      FIXTURE.hiddenComponent.name,
      FIXTURE.hiddenComponent.slug,
    ]
  );

  const componentId = `(select c.id from public.components c
      join public.projects p on p.id = c.project_id
      where p.slug = '${FIXTURE.projectSlug}' and c.slug = '${FIXTURE.publishedComponent.slug}')`;
  const sprintId = `(select s.id from public.sprints s
      join public.projects p on p.id = s.project_id
      where p.slug = '${FIXTURE.projectSlug}' and s.number = 1)`;

  await query(
    `insert into public.work_items (sprint_id, title, status, order_index, component_id, client_published_at, client_title)
     values (${sprintId}, $1, 'in_progress', 0, ${componentId}, now(), null),
            (${sprintId}, $2, 'done',        1, ${componentId}, now(), $4),
            (${sprintId}, $3, 'in_progress', 2, ${componentId}, null,  null)`,
    [
      FIXTURE.publishedTitles[0],
      FIXTURE.publishedTitles[1],
      FIXTURE.hiddenTitle,
      FIXTURE.rewrittenAs,
    ]
  );

  await query(
    `insert into public.client_contacts (profile_id, client_id, status)
     select p.id, (select id from public.clients where name = $2), 'active'
       from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [CLIENT_CONTACT.email, FIXTURE.clientName]
  );
  await query(
    `insert into public.client_contacts (profile_id, client_id, status)
     select p.id, (select id from public.clients where name = $2), 'active'
       from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [OTHER_CONTACT.email, FIXTURE.otherClientName]
  );

  await query(
    `insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
     select p.id, (select id from public.projects where slug = $2), $3::public.client_capability[]
       from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [CLIENT_CONTACT.email, FIXTURE.projectSlug, COLLABORATOR]
  );
  await query(
    `insert into public.client_project_grants (contact_profile_id, project_id, capabilities)
     select p.id, (select id from public.projects where slug = $2), $3::public.client_capability[]
       from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [OTHER_CONTACT.email, FIXTURE.otherProjectSlug, COLLABORATOR]
  );

  // Two threads: one on the published component, one on the hidden one. The
  // second is the control — it must be invisible to her and visible to us.
  const admin = `(select p.id from public.profiles p
      join auth.users u on u.id = p.id where u.email = 'mohamed@coditu.com')`;

  await query(
    `insert into public.client_threads (component_id, project_id, title, opened_by)
     values (${componentId}, (select id from public.projects where slug = $2), $1, ${admin})`,
    [FIXTURE.question, FIXTURE.projectSlug]
  );
  await query(
    `insert into public.client_threads (component_id, project_id, title, opened_by)
     select c.id, c.project_id, $1, ${admin}
       from public.components c join public.projects p on p.id = c.project_id
      where p.slug = $2 and c.slug = $3`,
    [FIXTURE.hiddenQuestion, FIXTURE.projectSlug, FIXTURE.hiddenComponent.slug]
  );

  await query(
    `insert into public.client_messages (thread_id, author_id, body_json, body_text)
     select t.id, ${admin},
            jsonb_build_object('type','doc','content', jsonb_build_array(
              jsonb_build_object('type','paragraph','content', jsonb_build_array(
                jsonb_build_object('type','text','text',$2::text))))),
            $2
       from public.client_threads t where t.title = $1`,
    [FIXTURE.question, FIXTURE.questionOpener]
  );
}

/** Take away the right to answer, leaving the right to read. */
export async function readOnlyQuestions(): Promise<void> {
  await query(
    `update public.client_project_grants g
        set capabilities = array_remove(g.capabilities, 'reply_questions'::public.client_capability)
       from public.profiles p join auth.users u on u.id = p.id
      where g.contact_profile_id = p.id and u.email = $1`,
    [CLIENT_CONTACT.email]
  );
}

/** Revokes the grant, for the assertion that an open session stops working. */
export async function revokeFixtureGrant(): Promise<void> {
  await query(
    `update public.client_project_grants g set revoked_at = now()
       from public.profiles p join auth.users u on u.id = p.id
      where g.contact_profile_id = p.id and u.email = $1`,
    [CLIENT_CONTACT.email]
  );
}

export async function grantEffort(): Promise<void> {
  await query(
    `update public.client_project_grants g
        set capabilities = g.capabilities || '{view_effort}'::public.client_capability[]
       from public.profiles p join auth.users u on u.id = p.id
      where g.contact_profile_id = p.id and u.email = $1`,
    [CLIENT_CONTACT.email]
  );
}

export async function teardownClientFixture(): Promise<void> {
  // Order matters: work items and components hang off the projects, and the
  // grants hang off the contacts. Nothing here uses `cascade` on a client,
  // because `client_contacts.client_id` is `on delete restrict` — deliberately.
  await query(`delete from public.client_messages m using public.client_threads t, public.projects p
                where m.thread_id = t.id and t.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.client_thread_reads r using public.client_threads t, public.projects p
                where r.thread_id = t.id and t.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.client_threads t using public.projects p
                where t.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.work_items w using public.sprints s, public.projects p
                where w.sprint_id = s.id and s.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.components c using public.projects p
                where c.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.client_project_grants g using public.projects p
                where g.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.sprints s using public.projects p
                where s.project_id = p.id and p.slug like 'portal-e2e-%'`);
  await query(`delete from public.client_contacts c using public.clients cl
                where c.client_id = cl.id and cl.name like 'Portal E2E%'`);
  await query(`delete from public.projects where slug like 'portal-e2e-%'`);
  await query(`delete from public.clients where name like 'Portal E2E%'`);

  await removeThrowawayAccount(CLIENT_CONTACT.email);
  await removeThrowawayAccount(OTHER_CONTACT.email);
}
