-- Coditu — seed.
--
-- Week 17 is TRANSCRIBED, not invented: every item, status, grouping, estimate,
-- criterion, comment, activity line and time entry below comes from the ITEMS
-- constant in design/project/Coditu App.dc.html. The numbers it produces —
-- 16.0 logged / 46.0 estimated across 12 items — are what the sprint table
-- footer must show, and tests/seed-sums.test.ts asserts exactly that.
--
-- Week 16 is SYNTHETIC. The bundle carries no item-level data for it, only
-- "closed · 9 items". It exists so the sprint list and the burn-up have history.
-- It is marked as such and must not be quoted as fact to anyone.
--
-- Accounts are local development logins. Password for all of them: `coditu`.

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

insert into public.allowed_emails (email, note) values
  ('mohamed@coditu.com',     'Frontend Lead'),
  ('adam@coditu.com',        'Client Partnerships Lead'),
  ('abdelrahman@coditu.com', 'Frontend Engineer'),
  ('ahmed@coditu.com',       'Backend & DevOps');

-- The token columns are set to '' rather than left NULL on purpose. GoTrue
-- scans them into Go strings, and a NULL there fails EVERY sign-in with
-- "Database error querying schema" — an error that names the schema and says
-- nothing about the actual column. Seeding auth.users by hand means supplying
-- them.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mohamed@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Mohamed Tamer","role":"admin"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'adam@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Adam Nafie","role":"lead"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'abdelrahman@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Abdelrahman Elkhateeb","role":"engineer"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ahmed@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Ahmed Yehia","role":"engineer"}'::jsonb, '', '', '', '', '', '', '', '');

-- GoTrue expects an `identities` row per provider. Without it the user exists
-- but has no email identity, and some flows (magic link, identity linking)
-- refuse to run.
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id, u.id, u.id::text,
       json_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false)::jsonb,
       'email', now(), now(), now()
from auth.users u
where u.email like '%@coditu.com';

-- The auth trigger derives initials from the display name; the bundle's People
-- view spells them out, so set them explicitly. Adam is part-time on delivery
-- (the People view reads "0.0 / 20"), hence 1200 minutes rather than 2400.
update public.profiles set initials = 'MT', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set initials = 'AN', weekly_capacity_minutes = 1200 where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set initials = 'AE', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set initials = 'AY', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Clients and projects. Only EVIM runs a sprint cadence today — the other three
-- exist precisely so the no-sprint empty state and the project switcher have
-- something real to show.
-- ---------------------------------------------------------------------------

insert into public.clients (id, name, website_url, logo_path, accent_hex) values
  ('c0000000-0000-4000-8000-000000000001', 'EVIM',            'https://www.evim.de',      '/clients/evim.svg', '#2B57FF'),
  ('c0000000-0000-4000-8000-000000000002', 'Nile Atelier',    'https://nileatelier.com',  null,                '#12A594'),
  ('c0000000-0000-4000-8000-000000000003', 'Internal · DevOps', null,                     null,                '#5B8CFF'),
  ('c0000000-0000-4000-8000-000000000004', 'NVRMiss',         'https://nvrmiss.com',      null,                '#FFB020');

insert into public.projects (id, client_id, name, slug, scope, accent_hex) values
  ('40000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'MEINEvim components', 'meinevim',
   'SPFx component set inside SharePoint Online governance', '#2B57FF'),
  ('40000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'Nile Atelier partner portal', 'nile-atelier',
   'Partner onboarding and document routing', '#12A594'),
  ('40000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   'Ops Console', 'ops-console',
   'Unified dashboard over Redis, Pinecone, S3, PostgreSQL', '#5B8CFF'),
  ('40000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
   'NVRMiss landing', 'nvrmiss',
   'AI receptionist product landing and pricing', '#FFB020');

-- ---------------------------------------------------------------------------
-- Sprints
-- ---------------------------------------------------------------------------

insert into public.sprints (id, project_id, number, name, starts_on, ends_on, status, notes, notes_author_id) values
  ('50000000-0000-4000-8000-000000000016', '40000000-0000-4000-8000-000000000001', 16,
   'Sprint — Week 16', '2026-08-10', '2026-08-16', 'closed', null, null),
  ('50000000-0000-4000-8000-000000000017', '40000000-0000-4000-8000-000000000001', 17,
   'Sprint — Week 17', '2026-08-17', '2026-08-23', 'active',
   -- Verbatim from the bundle's exportMd(). The bold line is the highlight
   -- convention the app renders with a 2px amber left rule.
   'Please work this sprint on the issues in the order they are sorted in. Stories with the same grouping are preferred to be implemented by the same developer because they overlap in some logic/UI.

**In the stories, there are highlighted sections, which means you need to discuss something before implementing — please reach out.**',
   'a0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Week 17 — transcribed. estimate_minutes = bundle hours * 60.
-- ---------------------------------------------------------------------------

insert into public.work_items
  (id, sprint_id, key, title, description, highlight, status, type, assignee_id, reviewer_id, deadline, estimate_minutes, grouping, order_index)
values
  ('60000000-0000-4000-8000-000000000140', '50000000-0000-4000-8000-000000000017', 'COD-140',
   'Add optional titles to all webparts',
   'A unified optional title field on all webparts.',
   'Confirm with EVIM whether the toggle default should differ for the Events webpart before implementing.',
   'in_progress', 'story',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-08-21', 480, null, 0),

  ('60000000-0000-4000-8000-000000000141', '50000000-0000-4000-8000-000000000017', 'COD-141',
   'Tabs with Cards',
   'Card variant for the tabs webpart, matching the link tile spacing.',
   null, 'in_peer_review', 'change_request',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-08-20', 60, null, 1),

  ('60000000-0000-4000-8000-000000000142', '50000000-0000-4000-8000-000000000017', 'COD-142',
   'Tabs with Cards: height logic fix',
   'When a 4th card has no description it wraps to a new row at a different height.',
   null, 'in_peer_review', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-08-21', 120, 1, 2),

  ('60000000-0000-4000-8000-000000000143', '50000000-0000-4000-8000-000000000017', 'COD-143',
   'Link Kachel changes',
   'Icon slot, hover treatment, and description truncation for the link tiles.',
   null, 'in_peer_review', 'change_request',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-08-22', 180, 1, 3),

  ('60000000-0000-4000-8000-000000000144', '50000000-0000-4000-8000-000000000017', 'COD-144',
   'Newspart changes',
   'Layout and metadata changes to the news webpart.',
   null, 'ready', 'change_request', null, null, '2026-08-23', 180, 2, 4),

  ('60000000-0000-4000-8000-000000000145', '50000000-0000-4000-8000-000000000017', 'COD-145',
   'Banner News Mode',
   'Banner renders the latest news item with an image and headline.',
   'Needs a decision on which news source wins when both a page and a list item are pinned.',
   'ready', 'change_request', null, null, '2026-08-23', 300, 2, 5),

  ('60000000-0000-4000-8000-000000000146', '50000000-0000-4000-8000-000000000017', 'COD-146',
   'Responsiveness for Link Kachel, Tabs with Cards, Newspart',
   'One responsive pass across the three webparts, driven by container width.',
   null, 'in_peer_review', 'story',
   'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '2026-08-22', 240, null, 6),

  ('60000000-0000-4000-8000-000000000147', '50000000-0000-4000-8000-000000000017', 'COD-147',
   'Unifying pill button: arrow and animation',
   'One pill button across the component set.',
   null, 'ready', 'story', null, null, '2026-08-23', 120, null, 7),

  ('60000000-0000-4000-8000-000000000148', '50000000-0000-4000-8000-000000000017', 'COD-148',
   'Banner Intranet Mode',
   'Banner variant for intranet landing pages.',
   null, 'ready', 'change_request', null, null, '2026-08-23', 180, null, 8),

  ('60000000-0000-4000-8000-000000000149', '50000000-0000-4000-8000-000000000017', 'COD-149',
   'Rollover Contact Cards',
   'Contact card reveals details on hover and focus.',
   null, 'ready', 'change_request', null, null, '2026-08-23', 120, null, 9),

  ('60000000-0000-4000-8000-000000000150', '50000000-0000-4000-8000-000000000017', 'COD-150',
   'Calendar',
   'Calendar webpart — scope not agreed yet.',
   null, 'draft', 'story', null, null, null, 480, null, 10),

  ('60000000-0000-4000-8000-000000000151', '50000000-0000-4000-8000-000000000017', 'COD-151',
   '[React] Redakteurseite',
   'Editor landing page rebuilt in React.',
   null, 'draft', 'change_request', null, null, null, 300, null, 11);

insert into public.acceptance_criteria (work_item_id, body, is_done, order_index) values
  ('60000000-0000-4000-8000-000000000140', 'Each webpart has a "Show Title" ("Überschrift anzeigen") toggle at the very top of its settings', true,  0),
  ('60000000-0000-4000-8000-000000000140', 'The toggle is on by default',                                                                          true,  1),
  ('60000000-0000-4000-8000-000000000140', 'When on, the title renders directly above the webpart',                                                 true,  2),
  ('60000000-0000-4000-8000-000000000140', 'When ?Mode=Edit, the title is editable inline from the webpart with the same options',                  false, 3),
  ('60000000-0000-4000-8000-000000000140', 'Behaviour matches the standard SharePoint "Events" webpart title exactly',                              false, 4),
  ('60000000-0000-4000-8000-000000000141', 'Card variant available as a tab layout option',                                                         true,  0),
  ('60000000-0000-4000-8000-000000000141', 'Spacing matches Link Kachel at all breakpoints',                                                        true,  1),
  ('60000000-0000-4000-8000-000000000142', 'All Link Kachels share the same height, even across rows',                                              true,  0),
  ('60000000-0000-4000-8000-000000000142', 'Height is set by the Kachel with the most text',                                                        true,  1),
  ('60000000-0000-4000-8000-000000000142', 'No min-height',                                                                                         false, 2),
  ('60000000-0000-4000-8000-000000000143', 'Icon slot supports SVG and Fluent icon names',                                                          true,  0),
  ('60000000-0000-4000-8000-000000000143', 'Description truncates at two lines with a title attribute',                                             true,  1),
  ('60000000-0000-4000-8000-000000000146', 'No horizontal overflow at 320px inside the SharePoint canvas',                                          true,  0),
  ('60000000-0000-4000-8000-000000000146', 'Container queries, not viewport breakpoints',                                                           true,  1);

-- Time entries.
--
-- The bundle records per-item entries AND per-person tooltips, and taken
-- naively the two disagree: attributing every entry to the item's assignee
-- gives Mohamed 13.0h, while the avatar tooltips say 12.5h / 3h / 0.5h.
-- Attributing COD-141's half hour to Ahmed reconciles both — per-item sums and
-- per-person totals — and it is the only assignment that does. Totals either
-- way: 960 minutes, 16.0 hours.
insert into public.time_entries (work_item_id, profile_id, minutes, worked_on) values
  ('60000000-0000-4000-8000-000000000140', 'a0000000-0000-4000-8000-000000000001', 180, '2026-08-18'),
  ('60000000-0000-4000-8000-000000000140', 'a0000000-0000-4000-8000-000000000001', 270, '2026-08-19'),
  ('60000000-0000-4000-8000-000000000141', 'a0000000-0000-4000-8000-000000000004',  30, '2026-08-19'),
  ('60000000-0000-4000-8000-000000000142', 'a0000000-0000-4000-8000-000000000001', 120, '2026-08-19'),
  ('60000000-0000-4000-8000-000000000143', 'a0000000-0000-4000-8000-000000000001', 180, '2026-08-20'),
  ('60000000-0000-4000-8000-000000000146', 'a0000000-0000-4000-8000-000000000003',  90, '2026-08-19'),
  ('60000000-0000-4000-8000-000000000146', 'a0000000-0000-4000-8000-000000000003',  90, '2026-08-20');

insert into public.comments (work_item_id, author_id, body_json, body_text, created_at) values
  ('60000000-0000-4000-8000-000000000140', 'a0000000-0000-4000-8000-000000000003',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Inline edit needs the same field ordering as the panel, otherwise editors lose the toggle when they switch modes."}]}]}'::jsonb,
   'Inline edit needs the same field ordering as the panel, otherwise editors lose the toggle when they switch modes.',
   '2026-08-19 14:02+03'),
  ('60000000-0000-4000-8000-000000000140', 'a0000000-0000-4000-8000-000000000001',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Agreed. Panel order is the source of truth; I mirror it in the inline editor."}]}]}'::jsonb,
   'Agreed. Panel order is the source of truth; I mirror it in the inline editor.',
   '2026-08-19 16:40+03'),
  ('60000000-0000-4000-8000-000000000141', 'a0000000-0000-4000-8000-000000000003',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Reviewing after COD-142, they touch the same layout code."}]}]}'::jsonb,
   'Reviewing after COD-142, they touch the same layout code.',
   '2026-08-19 09:20+03'),
  ('60000000-0000-4000-8000-000000000142', 'a0000000-0000-4000-8000-000000000001',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Removed the min-height entirely; row height now comes from the tallest card in the grid."}]}]}'::jsonb,
   'Removed the min-height entirely; row height now comes from the tallest card in the grid.',
   '2026-08-19 17:10+03');

-- ---------------------------------------------------------------------------
-- Week 16 — SYNTHETIC. Nine closed items so the sprint list and the burn-up
-- have history. Not transcribed from anything; do not quote these as fact.
-- ---------------------------------------------------------------------------

insert into public.work_items (sprint_id, key, title, status, type, assignee_id, reviewer_id, estimate_minutes, order_index)
select
  '50000000-0000-4000-8000-000000000016',
  'COD-' || (130 + n),
  ('Week 16 item ' || n || ' (synthetic history)'),
  'done', 'story',
  (case when n % 3 = 0 then 'a0000000-0000-4000-8000-000000000003' else 'a0000000-0000-4000-8000-000000000001' end)::uuid,
  (case when n % 3 = 0 then 'a0000000-0000-4000-8000-000000000001' else 'a0000000-0000-4000-8000-000000000003' end)::uuid,
  240,
  n - 1
from generate_series(1, 9) as n;

insert into public.time_entries (work_item_id, profile_id, minutes, worked_on)
select w.id, w.assignee_id, 250, ('2026-08-1' || ((w.order_index % 5) + 1))::date
from public.work_items w
where w.sprint_id = '50000000-0000-4000-8000-000000000016';

-- The sequence is NOT advanced by explicit keys, so the next generated key
-- would be COD-140 — one this seed just inserted. See docs/02-DATA-MODEL.md.
select setval('public.work_item_key_seq', 151, true);
