-- Coditu — seed.
--
-- TRANSCRIBED, not invented. Every client, project, sprint, work item, acceptance
-- criterion, logged hour and attachment below comes from the team's Notion
-- workspace export, converted by scripts/import-notion-export.mjs. Do not edit
-- this file by hand: re-run the script against the export instead.
--
-- Fifteen sprints of EVIM web parts, Week 3 (November 2025) through Week 17
-- (August 2026), plus Converso. Where the export is silent the column is NULL —
-- there are no estimates in Notion, nine sprints have no datable window, and no
-- sprint note records who wrote it. docs/05-DECISIONS.md says why.
--
-- The export also carries live credentials — a SharePoint password, an OpenAI
-- key, an OpenRouter key, a test login. They are redacted on the way through and
-- the finished SQL is re-checked for them. Nothing here should ever be pasted
-- back from the export by hand.
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
   '{"full_name":"Mohamed Tamer"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'adam@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Adam Nafie"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'abdelrahman@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Abdelrahman Elkhateeb"}'::jsonb, '', '', '', '', '', '', '', ''),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ahmed@coditu.com', crypt('coditu', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Ahmed Yehia"}'::jsonb, '', '', '', '', '', '', '', '');

-- GoTrue expects an `identities` row per provider. Without it the user exists
-- but has no email identity, and some flows (magic link, identity linking)
-- refuse to run.
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id, u.id, u.id::text,
       json_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false)::jsonb,
       'email', now(), now(), now()
from auth.users u
where u.email like '%@coditu.com';

-- Roles are set HERE, not in `raw_user_meta_data` above: the trigger used to
-- read the role out of the sign-up request, which is how a client could hand
-- itself `admin` — see `20260821180000_role_is_not_client_supplied.sql`. Every
-- new account is an engineer now, so the seed states the roles it wants as the
-- privileged writer it already is.
--
-- Adam is part-time on delivery, hence 1200 minutes rather than 2400.
update public.profiles set role = 'admin',    initials = 'MT', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set role = 'lead',     initials = 'AN', weekly_capacity_minutes = 1200 where id = 'a0000000-0000-4000-8000-000000000002';
update public.profiles set role = 'engineer', initials = 'AE', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000003';
update public.profiles set role = 'engineer', initials = 'AY', weekly_capacity_minutes = 2400 where id = 'a0000000-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- Clients and projects.
--
-- EVIM and Converso are real and carry the imported work. The other three exist
-- so the no-sprint empty state and the project switcher have something to show;
-- they hold no items and must not be quoted as delivery history.
-- ---------------------------------------------------------------------------

insert into public.clients (id, name, website_url, logo_path, accent_hex) values
  ('c0000000-0000-4000-8000-000000000001', 'EVIM',            'https://www.evim.de',      '/clients/evim.svg', '#2B57FF'),
  ('c0000000-0000-4000-8000-000000000002', 'Nile Atelier',    'https://nileatelier.com',  null,                '#12A594'),
  ('c0000000-0000-4000-8000-000000000003', 'Internal · DevOps', null,                     null,                '#5B8CFF'),
  ('c0000000-0000-4000-8000-000000000004', 'NVRMiss',         'https://nvrmiss.com',      null,                '#FFB020'),
  ('c0000000-0000-4000-8000-000000000005', 'Converso',        'https://www.converso.ai',  null,                '#7C5CFF');

insert into public.projects (id, client_id, name, slug, scope, accent_hex) values
  ('40000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'MEINEvim components', 'meinevim',
   'SPFx component set inside SharePoint Online governance.

Standing requirements:
• Login credentials are held outside this system
• Mobile/Tablet/Desktop responsiveness
• First, Last name pasring should meet german naming convensions
• Modern cool UI with animations
• Use Assistant, sans-serif as default font
• ⁠font size to be slider
• Use #d80345 as default color
• Use Fluent UI as much as possible
• Changes to a task are proposed, not applied directly', '#2B57FF'),
  ('40000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',
   'Nile Atelier partner portal', 'nile-atelier',
   'Partner onboarding and document routing', '#12A594'),
  ('40000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   'Ops Console', 'ops-console',
   'Unified dashboard over Redis, Pinecone, S3, PostgreSQL', '#5B8CFF'),
  ('40000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004',
   'NVRMiss landing', 'nvrmiss',
   'AI receptionist product landing and pricing', '#FFB020'),
  ('40000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000005',
   'Converso dashboard', 'converso',
   'Frontend review of the Converso database dashboard', '#7C5CFF');


-- ---------------------------------------------------------------------------
-- Sprints. Week 17 is the one in flight; everything before it is closed.
--
-- Only six windows are evidenced by the export; the rest are NULL because the
-- sprints are not weekly-contiguous and there is nothing honest to derive them
-- from. `notes_author_id` is NULL throughout — Notion does not record who wrote
-- a sprint note, and attributing it to a plausible person would be a guess
-- printed under someone's name.
-- ---------------------------------------------------------------------------

insert into public.sprints (id, project_id, number, name, starts_on, ends_on, status, notes, notes_author_id) values
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', 3,
   'Sprint — Week 3', '2025-11-03', '2025-11-09', 'closed', '@Abdelrahman Elkhateeb @Mohamed Tamer @adam plz update this page not scWeek 3, it’s deprecated now

@adam if you deployed heading and spe. update its status

check ready for review tickets

Week 3 Web Part Requirements.pdf

please check review @Ahmed Yehia

• [x]  `process and timeline`

• [ ]  old review issues still there? (except preview issue) (@abdelrahman elkhateeb issues are still there)

• [x]  `Calendar`

• [ ]  A lot of issues still :( @Mohamed Tamer can u handel Calendar issues plz?

• [x]  `Heading and Separator`

• [x]  local testing heading and sep. (yehia)

• [ ]  local testing Baneer with news (yehia)

• remaning tasks dd

• [x]  review UI for Calendar (khateeb)

• [ ]  review UI for process and timeline(khateeb)

• [x]  review UI for Heading Separator(khateeb)

• [x]  check fix: Banner with new changes (khateeb)

while reviewing the UI, test implemented functionally and start marked tested functionality as done
Calendar

• testing notes

    to connect with a calander use this url

    ```jsx
    https://evimwi.sharepoint.com/Lists/Events/AllItems.aspx

    calander name is (not used anymore)
    Events
    ```

• [x]  `the api connection isn’t working fine should be fixed to display events from this url`

```jsx
https://evimwi.sharepoint.com/Lists/Events/AllItems.aspx

```

https://community.origamiconnect.com/t/calendar-color-coded-sharepoint-calendar-microsoft-365-group-calendar/416
Acceptance Criteria:

• [x]  Calendar loads events from Sharepoint Calendars (Events Lists, see
https://www.loom.com/share/496973d5ec614f07ac4e533f2e59e3b5 from 2:49)

• [x]  In the properties pane, users can add/edit/remove calendars (like document libs in
Finder and co). Calendars can be added from different sites. Each Calendar has a
label and a color.

• [x]  Default Date property that sets the calendar date range based on the following
options:

• [x]  -today - shows today’s events

• [x]  -this week - shows all events from today until 7 days from today

• [x]  -this month(default) - shows all events from today till the end of the month

• [x]  -this quarter - shows all events from today until last days of month 3 from
    now

• [x]  -this year - shows all events from today till the end of the year

• [x]  Calendar month names are either to be hardcoded in German or dynamic

• [x]  The Calendar UI is like the attached pictures..(Tamer)

• [x]  Month View Picker with arrows to slide between months

• [x]  When a time range is selected (by clicking on a month day number for start of
    range, and another for end of range. Edge case: only 1 day, means no end of
    range), then events in that time range are shown as cards under the calendar.

• [x]  If no time range is selected, then show all the events in the selected default
    date (Today, This week, This month …)

• [ ]  An event card shows the data, time and event title. Also include the
    calendar’s custom label as a “tag” @Mohamed Tamer if it’s done update status

• [x]  When card is hovered over, animate the right border in with the custom color
    of the calendar the event is fetched from

• [x]  Toggle functionality to filter events based on calendar via dropdown

• Review

• [x]  Toggle to hide “Month View Picker” and only show events happening during the
    Default Date

• Styling:

• [x]  Max Web Part Height to limit the number of events with a “show additional
    events” button (maybe use expand icon here to avoid translation to German?) (Tamer)

• [x]  Use default color #D80345 instead of blue for hardcoded colors (Tamer)

• see this screenshot and change everything in blue-ish/purple-ish to the code above (also hover on Reset selection, month change arrows)

• [x]  The event card needs a bit more work.. it is too bulky.. too much information (Tamer)

• see details

• i like the simplicity and conciseness of this…

• Notice also in your implementation how the date and time are each stated twice.. redundant duplication

• The bulkiness gets more apparent with 3+ events:

• [x]  I would remove the “Start” and “End” tags in the selection range, or at least make optional (Tamer)

• [x]  I would make the default range/selected range tag optional (Tamer)

• [x]  If the month view is toggled off, hide “Reset selection” button (Tamer)

• [ ]  What do these labels do? Can’t see them. @Mohamed Tamer if it’s done update status

• [x]  Make Days “Mon”, “Tue”, … dynamic as is implemented with Months. Days also have German names ;) (Tamer)

• [x]  Calendar not responsive in narrow column section

• See screenshot

• [x]  The functionality “Max event list height (px)” is okay but should accompanied with a “show more events” button as in the requirements. Maybe it would be easier to have “Max events in list”? Then if the amount of events surpasses, show the expand button? (Tamer)
Process and Timeline

https://community.origamiconnect.com/t/process-and-timeline-with-targeting-and-tracking/404
Acceptance Criteria:

• [x]  adjust animation line to go from right to left instead of left to right

• [x]  UI: Arrow (left to right) that connects Quick Link Icons

• [x]  On mobile: Arrow is vertical top to bottom @Mohamed Tamer if it’s done update status

• [x]  Add/edit/remove Steps (same input format as banner with news)

• [x]  Each Step consists of:

• [x]  Title

• [x]  Subtitle

• [x]  Optional description which shows up as fancy tooltip when hovering over an
    icon @Mohamed Tamer if it’s done update status

• [x]  Icon (Fluent with preview or Custom PNG)

• [x]  Icon color

• [x]  Optional color to override background gradient for specific step

• [x]  Optional URL to open when icon is clicked

• [x]  Slider to resize entire webpart, to let user avoid arrow overflowing to a second line

• Styling:

• [x]  Text color

• [x]  Tooltip colors (text, background) @Mohamed Tamer if it’s done update status

• [x]  Gradient start, middle, end
Review

• [x]  @Ahmed Yehia properties in first page are not working.. text is not changing, same with colors, icons, etc..

• @adam preview keda … khalas worked after preview again, is this necessary?

• -

• [x]  Need more space on the top for icons to not be cut when hovered over

• i also can’t see the tooltip when i hover?  @Mohamed Tamer if it’s done update status

    20251106-2007-57.5555591.mp4

• [x]  Make resize scale minimum lower than 60%, allow till say 10% for example?

• [x]  Responsiveness needs work

• maybe for narrow screen tooltip should come from side? idk… check attached vid in dropdown

        20251106-2014-13.2920064.mp4

LinkedIn Feed  *(first requirements draft)*

https://community.origamiconnect.com/t/linkedin-feed-web-part-for-sharepoint/786
Acceptance Criteria:

• Carousel of posts, each post is a returned Object from a backend API which will be
provided by Adam:

```jsx
{
“author”: {
“pic”: link,
“name”: str
},
“date_posted”: str (format german string),
“text”: str,
“media”: {
“type”: “img” or “vid”
,
“link”: str,
}
}
```

• note: @adam for the data we will hard code it in german lang.

• • • • • • • Styling:

• Text color

• Background color

How can we make the date text fit with German language?
Heading and Separator

https://community.origamiconnect.com/t/heading-and-separator-web-part-with-custom-font-for-sharepoint/597
Acceptance Criteria:

• [x]  disable animations for all exxcept border bottom

• [x]  Custom text with {firstname}, {lastname}, {fullname} to show as heading and
separator between webparts

• [x]  Small animation on hover

• [x]  Heading styles dropdown includes:

• [x]  Clean (Just text)

• [x]  Rounded box (Rounded rectangle as background)

• [x]  Border left

• [x]  Border Bottom

• [x]  Centered Bottom separator

• [x]  Centered Top separator

• [x]  Dynamic styling:

• [x]  Thickness of border/separator

• [x]  Border/box color

• [x]  Corner radius

• [x]  Text styling should include

• [x]  Font

• [x]  Weight (important weird weight to include: Assistant Bold, whatever that is…)
    or maybe just slider…

• [x]  Size slider

• [x]  Margins dynamic in % to move around freely near other webparts

• [x]  Left margin

• [x]  Top margin

• [x]  Bottom margin
Review

• [x]  Only leave “Lift” hover animation, remove the rest. Hardcoded

• [x]  Fix {firstname}, {lastname} to adhere to the company’s names…

• e.g. Nafie, Adam (EVIM Personal)

• split by comma once and then split by space for first name?

• [x]  Fonts as dropdown? or link to documentation that previews available css fonts, so that they can just copy-paste
FIX: Banner with News changes

• [x]  Change color of scrollbar and slideshow tracker to #D80345

• See circled @abdelrahman elkhateeb

• adam changed color of arrows, scrollbar and default featured tag gradient also

• [x]  Left and right arrows not centered vertically, need to go a little to the bottom (done)

• [x]  😅 the company is claiming that the webpart’s container has a gray background… @adam  doesn’t see it, but they would like it to be white, so that it would fit with other webparts… keep @adam updated on this specifically(done)

• [x]  slideshow trackers on mobile are currently being shown as squares and circles, fix please because they are too big(done)', null),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', 4,
   'Sprint — Week 4', '2025-11-10', '2025-11-16', 'closed', '@Abdelrahman Elkhateeb @Ahmed Yehia

Every Component has its acceptance criteria inside it', null),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', 5,
   'Sprint — Week 5', null, null, 'closed', '@Abdelrahman Elkhateeb @Ahmed Yehia

OpenAI API key for codex:

[OpenAI key redacted]

Please tell @adam  if credits need recharging', null),
  ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001', 6,
   'Sprint — Week 6', null, null, 'closed', 'Openrouter api key: [OpenRouter key redacted]

Use openrouter with Claude Sonnet 4.5 @abdelrahman elkhateeb

Although new Change Requests (CRs) shouldn’t take time, they are necessary to ensure the delivery of complete, responsive, pixel-perfect, and error-free components.

@Mohamed Tamer i don’t have time to review the small fixes you added, so it’s up to you to review
@adam no problem, me ,yehia and khateeb will review it

@Ahmed Yehia after testing please take care of PROMO ALERT', null),
  ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', 7,
   'Sprint — Week 7', '2025-12-22', '2025-12-28', 'closed', null, null),
  ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000001', 8,
   'Sprint — Week 8', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000001', 9,
   'Sprint — Week 9', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000001', 10,
   'Sprint — Week 10', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000001', 11,
   'Sprint — Week 11', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000001', 12,
   'Sprint — Week 12', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000013', '40000000-0000-4000-8000-000000000001', 13,
   'Sprint — Week 13', null, null, 'closed', null, null),
  ('50000000-0000-4000-8000-000000000014', '40000000-0000-4000-8000-000000000001', 14,
   'Sprint — Week 14', null, null, 'closed', 'Figma: https://www.figma.com/design/n5OfGEb5H3CWL5TAvp8pzt/EVIM-Design-%C3%9Cbergabe?node-id=11901-28588&m=dev&t=5rL7Yo5lVJ4Y5AUH-1 (https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fn5OfGEb5H3CWL5TAvp8pzt%2FEVIM-Design-%25C3%259Cbergabe%3Fnode-id%3D11901-28588%26m%3Ddev%26t%3D5rL7Yo5lVJ4Y5AUH-1&data=05%7C02%7CAdam.Nafie%40evim.de%7C350013d413124792c2c908deec8eab8f%7C6ee46e2c3f30448695b94a4992d36536%7C0%7C0%7C639208295466026525%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=jzpYXcYgG32qyjNs5mxPwyb%2BC4ENMzoHBRzKkkvRXUs%3D&reserved=0)
EVIM Corporate Design

Typography of Text Headlines
All text fields close seamlessly in a vertical direction; they do not overlap each other. Their width is variable and is based on the text. The individual lines are offset horizontally. The rounded ends of the text or colored rectangles are flush on the left and right, i.e. they form a perfect semicircle.

1. The spacing above and below the headline text to the edge of the text field equals the height of a lowercase letter in square format.
2. The spacing to the left and right of the headline text to the edge of the text field equals the height of an uppercase letter in square format.
3. The color of the text fields is white, combined with a simple solid-color fill without any typeface.
4. The typeface is *Nachtblau*, and the font weight/style is "Assistant Bold."
5. Content can be emphasized within the headline by using the font color red.
6. The bottom text field is duplicated and converted into a pure color field in a slightly lighter red (90%). The offset follows a 45° angle. The offset is applied to the right and downward until the horizontal center of the text field above is reached.
When requested to change webpart name, do not change any unique ids. Especially not in config/package-solution.json. Only change in preconfiguredEntries.title.default in src/*/*/*.manifest.json

August 4, 2026 6:24 PM  → @Ahmed Yehia  make all ticket dev started, will check them first then update status to ready for review

@adam  → if you faced issue use NODE version 22', null),
  ('50000000-0000-4000-8000-000000000015', '40000000-0000-4000-8000-000000000001', 15,
   'Sprint — Week 15', '2026-08-03', '2026-08-09', 'closed', null, null),
  ('50000000-0000-4000-8000-000000000016', '40000000-0000-4000-8000-000000000001', 16,
   'Sprint — Week 16', '2026-08-10', '2026-08-16', 'closed', null, null),
  ('50000000-0000-4000-8000-000000000017', '40000000-0000-4000-8000-000000000001', 17,
   'Sprint — Week 17', '2026-08-17', '2026-08-23', 'active', '@Abdelrahman Elkhateeb @Mohamed Tamer @Ahmed Yehia

• please work this sprint on the issues in the order they are sorted in.

• Stories with the same color/grouping are preferred to be implemented by the same developer because they overlap in some logic/UI.

• In the stories, there are highlighted sections, which means you need to discuss something with me and not implement immediately. So please reach out', null),
  ('51000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', 1,
   'Sprint — Converso review', null, null, 'planned', null, null);


-- ---------------------------------------------------------------------------
-- Work items.
--
-- `estimate_minutes` is NULL for every row. Notion recorded one number per item,
-- "Hours Worked", and that is time spent, not time forecast — it becomes a
-- `time_entries` row below. There are no estimates in the source and none are
-- invented here, so the sprint footer reads what was logged against nothing
-- planned until somebody plans it.
--
-- `order_index` is the board's own row order, taken from the un-sorted view CSV.
-- ---------------------------------------------------------------------------

insert into public.work_items
  (id, sprint_id, key, title, description, highlight, status, type,
   assignee_id, reviewer_id, deadline, estimate_minutes, grouping, order_index)
values
  ('60000000-0000-4000-8000-000000000140', '50000000-0000-4000-8000-000000000003', 'COD-140',
   'Calendar',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   '2025-11-09', null, null, 0),

  ('60000000-0000-4000-8000-000000000141', '50000000-0000-4000-8000-000000000003', 'COD-141',
   'Process and Timeline',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-11-07', null, null, 1),

  ('60000000-0000-4000-8000-000000000142', '50000000-0000-4000-8000-000000000003', 'COD-142',
   'LinkedIn Feed',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000143', '50000000-0000-4000-8000-000000000003', 'COD-143',
   'Heading and Separator',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   '2025-11-07', null, null, 3),

  ('60000000-0000-4000-8000-000000000144', '50000000-0000-4000-8000-000000000003', 'COD-144',
   'Banner with News changes',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-11-09', null, null, 4),

  ('60000000-0000-4000-8000-000000000145', '50000000-0000-4000-8000-000000000004', 'COD-145',
   'Changes: Collapser',
   null,
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000146', '50000000-0000-4000-8000-000000000004', 'COD-146',
   'Changes: Carousel with expanding Links',
   null,
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000147', '50000000-0000-4000-8000-000000000004', 'COD-147',
   'Changes: User feedback',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000148', '50000000-0000-4000-8000-000000000004', 'COD-148',
   'Changes: Finder',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000149', '50000000-0000-4000-8000-000000000004', 'COD-149',
   'Changes: Video Carousel',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 4),

  ('60000000-0000-4000-8000-000000000150', '50000000-0000-4000-8000-000000000004', 'COD-150',
   'Changes: LinkedIn Feed',
   'https://community.origamiconnect.com/t/linkedin-feed-web-part-for-sharepoint/786
Acceptance Criteria:
• Carousel of posts, each post is a returned Object from a backend API which will be
provided by Adam:

```jsx
{
“author”: {
“pic”: link,
“name”: str
},
“date_posted”: str (format german string),
“text”: str,
“media”: {
“type”: “img” or “vid”
,
“link”: str,
}
}
```
• ngrok endpoint with real posts:

GET `https://delicia-haematoxylic-unintellectually.ngrok-free.dev/api/linkedin-posts` (https://delicia-haematoxylic-unintellectually.ngrok-free.dev/api/linkedin-posts) (use “`ngrok-skip-browser-warning`”: “blabla” in header of request)
• UI as described in old reqs

Review:',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', null,
   '2025-11-16', null, null, 5),

  ('60000000-0000-4000-8000-000000000151', '50000000-0000-4000-8000-000000000004', 'COD-151',
   'Urgent Alert',
   'Acceptance criteria:
• TopPlaceholder has
• dynamic solid background color
• title
• message (multiline)
• dynamic icon
• dynamic text color
• Start date, end date for timed alerts
• isActive toggle
• Alerts are defined in a list called “Alerts” on the website for which the alert should show',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 6),

  ('60000000-0000-4000-8000-000000000152', '50000000-0000-4000-8000-000000000004', 'COD-152',
   'Instagram Feed',
   'Same as LinkedIn Feed but for instagram with some instagram characteristic (media above caption, colors, etc.)

Please change to local testing after review',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 7),

  ('60000000-0000-4000-8000-000000000153', '50000000-0000-4000-8000-000000000004', 'COD-153',
   'Anniversaries',
   '• Image
• Vertical carousel displaying anniversary cards
• Each card shows:
• Person''s profile picture
• Person''s name
• Anniversary label (e.g., "Work Anniversary", "Birthday")
• Date in German format
• Slim card design matching the reference image provided
• Scrollable carousel
• Dynamic up/down arrows that appear/disappear based on scroll position
• Hover effects on cards with left border showing
• Dynamic title
• Styling:
• dynamic accent color',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 8),

  ('60000000-0000-4000-8000-000000000154', '50000000-0000-4000-8000-000000000004', 'COD-154',
   'Banner WITHOUT News',
   '( I actually called it banner XD)',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-11-16', null, null, 9),

  ('60000000-0000-4000-8000-000000000155', '50000000-0000-4000-8000-000000000004', 'COD-155',
   'Org Chart',
   'Acceptance Criteria:

‘groups’
    to a certain person from the directly above level, acting as an x-axis.
    o Option to Add/remove Level (collapsibles in 1 page like Banner w/ News)
• Would you need us to assume maximum 3 levels for easier logic
    implementation? What do you think?
• Inside each Level, option to add/remove groups (collapsibles as well)
    [see people without dotted lines in pic above]
    field that allows only 1 person to identify to which person from the directly
    upper level is it going to be connected to, so use ‘Controlled People Picker’
    here to only select from people from the level above
انا وخطيب لقينا ده:https://github.com/pnp/sp-dev-fx-webparts/tree/main/samples/react-organization-chart

November 13, 2025 11:10 PM @adam plz review, you can ignore the spacing and padding for the filter side bar, either tamer or khateeb will fix them later, you can focus on the main goal and tree representation, I didn’t limit sub group number and levels I think we can handle more than 2

---

@Mohamed Tamer @abdelrahman elkhateeb feel free to adjust the UI for this ticket, still need some adjustments

—

adam: shabab let’s use comments feature above',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   '2025-11-16', null, null, 10),

  ('60000000-0000-4000-8000-000000000156', '50000000-0000-4000-8000-000000000004', 'COD-156',
   'Embed Plus',
   'Acceptance Criteria:

webpart is added to a page
https://community.origamiconnect.com/t/embed-plus-web-part/723

Check “Modern script editor” webpart to understand more and replicate… super simple:

November 13, 2025 10:03 PM @adam plz review',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   '2025-11-16', null, null, 11),

  ('60000000-0000-4000-8000-000000000157', '50000000-0000-4000-8000-000000000004', 'COD-157',
   'Main Navigation',
   'Acceptance Criteria:

Root (compare with pic)
    |--- Home.url
    |--- Company Resources
            | --- xx.url
            | --- yy.url
    |--- Employee resources
            | --- New Hire Onboarding.url
            | --- Benefits.url
    etc…
    inherent with the implementation, but we should test for this)
    webpart, Excel sheet in dedicated folder if otherwise?)',
   'I need you to tell me if we can pull having a navigation as a webpart off… idea is that
we need the navigation to appear in the app MeinEVIM (go download from play/app
store) which only embeds the Sharepoint Site without the Sharepoint Navigation
If we can’t… then the Navigation will need to be implemented as an “Application
Customizer” …',
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-11-16', null, null, 12),

  ('60000000-0000-4000-8000-000000000158', '50000000-0000-4000-8000-000000000004', 'COD-158',
   'Interactive Video',
   'Reference: https://community.origamiconnect.com/t/video-on-hover-autoplay/872

Acceptance Criteria:
• A video uploaded to Sharepoint can have its stream embed added to the property pane
• Video only plays on hover, no sound
• Video roundness dynamic',
   null,
   'todo', 'story',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 13),

  ('60000000-0000-4000-8000-000000000159', '50000000-0000-4000-8000-000000000005', 'COD-159',
   'News Center',
   'https://community.origamiconnect.com/t/news-center-web-part/634
Acceptance Criteria:

Ability to create and/or connect list from sidepane (Same functionality as in User Feedback)

The connected list will act as our database for news. If User has no link to a list, they can create one from the sidepane.

After list creation, show hyperlink for user to go to “Add News” from the list directly

List columns:

Title (Single line text)

Body (Multi line text)

Image Link (Single line text)

Category (Single line text)

Optional URL (Single line text)

Ability to add and load “Categories” in sidepane using collapsibles.

A category consists of:

Category name

Category color

Loading categories from connected lists is done by getting all the items from the connected list, then gathering all the “Category” columns in a set. The collapsibles are then refreshed accordingly. Maybe it is best if this is done automatically when an already existing list is connected. When loading this
way, you will only load category names, give each category a different color, but user can eventually change it.

Option to sort news by Created Date or Modified Date

UI:

News items are split into tabs. Each tab represents a category. There is an “All News” tab.

Each tab contains pages. Each consists of a dynamic number of news items.

A news item is a container that consists of an image, the author (CreatedBy column), the date of modification (Modified column), Category tag showing the category label and color

When a news item is clicked, it by default opens a modal that shows the Body of the News as well as the other info already shown in the news item before clicking.

If toggle “Open URL” is true, then instead of opening modal, open link in URL column.

Some more dynamic stuff:

Default tab

“All News” text

News per page

Image height (in News item not modal)

News Title size

News Title boldness

News category tab color (active)

Toggle to hide Author and Date

Toggle Open URL',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000160', '50000000-0000-4000-8000-000000000005', 'COD-160',
   'Social Corner',
   'https://canada1.discourse-cdn.com/flex031/uploads/origamiconnect/original/1X/2e301b019b8188c3199f0902b01f61a3c872a898.gif

https://community.origamiconnect.com/t/social-corner-web-part/397
Acceptance Criteria:
• Ability to create and/or connect list from sidepane (Same functionality as in User Feedback)
o
The connected list will act as our database for posts. If User has no link to a list, they can create one from the sidepane.
o
After list creation, show hyperlink for user to go to the list directly via a hyperlink
o
List columns:
▪
Title (Single line text)
▪
Body (Multi line text)
▪
Likes (Multi line text, stringified JSON array)
▪
Comments (Multi line text, stringified JSON array)
▪
Attachment (already exists no need to create via API)
• User can “Write a post…” from the webpart UI, which creates a new item in the connected list.
o
User gives in text Title and body
o
User attaches image (which then gets uploaded into the Attachments column in the list)
• Posts/items are fetched from the list and shown as cards as in the gif above
o
Card shows author (CreatedBy column)
o
Card shows posting date (Created column)
o
Card has Read more functionality for bodies more than 200 chars
o
Option to see comments
o
String field to add a comment (comments are then saved as stringified JSON arrays in Comments column of item)
o
Option to like posts (adds user name or claims to Likes JSON array)
o
Show number of likes
• Dynamics:
o
Accent color
o
English text',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000161', '50000000-0000-4000-8000-000000000005', 'COD-161',
   'Interactive Video',
   'Reference: https://community.origamiconnect.com/t/video-on-hover-autoplay/872

Acceptance Criteria:
• A video uploaded to Sharepoint can have its stream embed added to the property pane
• Video only plays on hover, no sound
• Video roundness dynamic',
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000162', '50000000-0000-4000-8000-000000000005', 'COD-162',
   'Expanding Links WITHOUT Carousel',
   'We want the links panel from the Carousel with links webpart as its own separate webpart. Name it “Links Carousel”',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000163', '50000000-0000-4000-8000-000000000005', 'COD-163',
   'KPI and Metrics',
   'https://community.origamiconnect.com/t/kpi-and-metrics-web-part-without-targeting/405
Accepted Criteria:

Add/edit/remove KPIs by collapsible, a KPI consists of
Title (text)
Value (text)

KPI Trend (dropdown: “Trending Up”, “Trending Down”, “Do not show”)
Details (text, optional shown as tooltip when hovered over KPI)
URL (optional, when KPI is clicked)
Color (to base a gradient on maybe?)
Ability to “Move KPI up/down” to configure sorting
KPIs to be shown as card in rows

Dynamic:
Font
Text sizes
Card size
Card roundness?
Left Margin (-50 till 50',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 4),

  ('60000000-0000-4000-8000-000000000164', '50000000-0000-4000-8000-000000000005', 'COD-164',
   'Tabs',
   'https://community.origamiconnect.com/t/tabs-web-part-with-rich-text-images-and-more/671
Acceptance Criteria:

Ability to add/remove tabs using collapsibles, tabs consist of
Title
Icon (optional)
Color
Image (optional, the image shown on the right in the pic above)
Steps, each step consists of

Highlight (Log in, Navigate, Select for example in pic above)
Remainder body
Optional customizable button like “Go to Employee Portal” above which is associated with a URL which',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 5),

  ('60000000-0000-4000-8000-000000000165', '50000000-0000-4000-8000-000000000005', 'COD-165',
   'Tabs with Cards',
   'https://community.origamiconnect.com/t/tabs-with-cards-web-part/677
Acceptance Criteria:

Ability to add/remove tabs
A tab is just a string associated with a custom color
Ability to add/edit/remove cards via collapsibles

Cards consist of:
Ref to tab
Title
Body
Dynamic Learn More text
URL

Optional Image (If no image give it a modern UI touch, like border above? Make the color of such accent dynamic in that case)

If only one tab available, maybe just don’t show tabs at all?

Cards with the associated selected tab are shown as a scrollable carousel

Dynamic stuff:
Card width
Color of Title and Learn More text
Text font
Learn More URL opens in new tab or not toggle',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 6),

  ('60000000-0000-4000-8000-000000000166', '50000000-0000-4000-8000-000000000006', 'COD-166',
   'Fix: tabs with cards',
   '• remove shadow from Tabs with Cards (especially shadow of tabs @Mohamed Tamer )
• On mobile: Tabs with Cards is buggy and hard hard to use
• Adam: Tab Border no longer abruptly cut at hover',
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000167', '50000000-0000-4000-8000-000000000006', 'COD-167',
   'Fix: Instagram Feed',
   '• instagram and linkedin feed should have the same ui, same pagination',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000168', '50000000-0000-4000-8000-000000000006', 'COD-168',
   'Fix: Anniverseries',
   '• the whole webpart is left aligned, maybe an extra padding, margin, wrong flex alignments',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000169', '50000000-0000-4000-8000-000000000006', 'COD-169',
   'Fix: LinkedIn Feed',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000170', '50000000-0000-4000-8000-000000000006', 'COD-170',
   'Fix: Process and Timeline',
   '• the text is not clear especially on smaller screen
 @Abdelrahman Elkhateeb u could fix it by putting the text in div that is a little bit elevated.
• hover is not working properly on smaller screens',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 4),

  ('60000000-0000-4000-8000-000000000171', '50000000-0000-4000-8000-000000000006', 'COD-171',
   'Fix: news center',
   'Before:

After:
• make the padding on smaler screens as follows:

```css
padding: 0px 10px;
```

but on bigger screens keep the same
• the scroll bar should only be visible when trying to scroll, (auto) not always',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 5),

  ('60000000-0000-4000-8000-000000000172', '50000000-0000-4000-8000-000000000006', 'COD-172',
   'Banner Half-image',
   'Acceptance Criteria:
• Can add image URL
• Can add big Title text (can use {firstname}, {lastname}, {fullname})
• Can add body (can use {firstname}, {lastname}, {fullname})
• Make the text appear on the left side like in the pic, just make it look.. modern and fancy, maybe add a nice animation if possible when hovering over the banner',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 6),

  ('60000000-0000-4000-8000-000000000173', '50000000-0000-4000-8000-000000000006', 'COD-173',
   'Promo Alert',
   '---

Acceptance Criteria:
• Create Application Customizer that uses the TopPlaceholder functionality (See Urgent Alerts for example)
• When a page is in edit mode (not preview, maybe query parameter relevant here), show dynamic setting for the promo as in second pic above:

o Enable alert (boolean)
o Alert body (rich text allowing links, what do you think)
o Alert color
o Gradient end color
o Alert height
o Alert font size
• These dynamic settings should be saved in a list on the site, maybe name it PromoAlerts',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 7),

  ('60000000-0000-4000-8000-000000000174', '50000000-0000-4000-8000-000000000006', 'COD-174',
   'Button Link Plus',
   'Acceptance Criteria:
• User can add link
• Link is shown as button in the UI
• Add dynamic styling to the button… color, gradient, text font size style, roundness, opacity, border, animation, hover',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 8),

  ('60000000-0000-4000-8000-000000000175', '50000000-0000-4000-8000-000000000006', 'COD-175',
   'Poll',
   'Acceptance Criteria:
• Webpart side pane can create/connect to a list which acts as the database for the polls. The list has following columns:
o Poll question (multiline text)
o Poll answers (single line text, to be populated with stringified json array of strings)
o Poll results (single line text, to be populated with stringified json object with keys being the json answer strings and the value being the number of times this answer was voted)
• From the side pane, the user can create a new poll or select an already existing one
o Creating a new poll means creating a new row in the connected list
o Select an already existing poll means selecting from the existing list rows from a dropdown (dropdown should show the poll question)
• In the UI the poll is displayed as above with modern looking radio buttons and a “vote” button
• The vote button text is dynamic
• Header should include the question directly, no need for this “Suggest poll” part
• Colors, font should be dynamic
•From the poll results, the user is shown after voting a pie chart or bar chart based on one of the libraries here: https://opensource.com/article/18/9/open-source-javascript-chart-libraries
• In the side pane there should be a dropdown field “Poll view”:
o “Normal”: shows results after voting
o “Results”: shows results only, no UI for voting',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 9),

  ('60000000-0000-4000-8000-000000000176', '50000000-0000-4000-8000-000000000006', 'COD-176',
   'Fix: links Carousel',
   '• remove fade on the left/right
• add option to adjust background opacity/brightness of each "card", so that he can make for example first card darker, second card lighter ---> do u think it makes sense to actually just give the option to control the color of a card separately?
• would it be possible to have several rows? he would like to decide which link goes in which row
• make the shadow height less, because the the shadow is being cut by the webpart border',
   null,
   'todo', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 10),

  ('60000000-0000-4000-8000-000000000177', '50000000-0000-4000-8000-000000000006', 'COD-177',
   'Fix: Banner with news',
   '• on smaller the banner is much more like a square, this is not the right implementation
• try to make the image fit, or fill to make it optional on smaller screens to let the bg image visible on smaller screen',
   null,
   'todo', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 11),

  ('60000000-0000-4000-8000-000000000178', '50000000-0000-4000-8000-000000000007', 'COD-178',
   'CR: Instagram / LinkedIn Feed',
   'Removing autoplay for videos (NOT slideshow)',
   null,
   'dev_started', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-12-29', null, null, 0),

  ('60000000-0000-4000-8000-000000000179', '50000000-0000-4000-8000-000000000007', 'COD-179',
   'CR: Banner',
   'Banner:

Acceptance Criteria:
• Responsiveness: On narrow screens keep same aspect ratio of image instead of zooming in… it is okay if the image appears smaller as long as text size is unaffected. Example page: https://evimwi.sharepoint.com/sites/loga —> Toggle dynamically because very dumb
Wide screen now:

Narrow screen now:
• Slider to position text horizontally (min. value: align-left, max. value: align-right).. do with padding or position, doesn’t matter as long as it is working as expected',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000180', '50000000-0000-4000-8000-000000000007', 'COD-180',
   'CR: Contact Cards',
   'Border of profile pic to be d80345
replace the color input filed into color picker

Allow controlling width of cards… they do not want the row of cards to fill up full width if only 2 people for example. Reference page: https://evimwi.sharepoint.com/sites/loga',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-12-29', null, null, 2),

  ('60000000-0000-4000-8000-000000000181', '50000000-0000-4000-8000-000000000007', 'COD-181',
   'CR: Button Link Plus',
   'Too much padding around the button
o fit-content
• Add shadow dynamic settings
o Toggle on/off
o Opacity
o Size
o Etc.',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-12-29', null, null, 3),

  ('60000000-0000-4000-8000-000000000182', '50000000-0000-4000-8000-000000000007', 'COD-182',
   'CR: Banner Half-Image',
   'Remove color overlay from on top of image',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-12-29', null, null, 4),

  ('60000000-0000-4000-8000-000000000183', '50000000-0000-4000-8000-000000000007', 'COD-183',
   'CR: Links Carousel / Carousel with expanding Links',
   'Acceptance Criteria:
• Remove shadow on hover
• Remove fade left and right (not visible to me, but visible to both of the people supervising)
• Remove icon black background
• Allow opacity slider to have min of 0%
• Adding dynamic linear gradient functionality for Carousel background
o Option to adjust gradient start, middle and end colors
o Option to adjust gradient angle',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   '2025-12-29', null, null, 5),

  ('60000000-0000-4000-8000-000000000184', '50000000-0000-4000-8000-000000000007', 'COD-184',
   'CR: Collapser',
   'Acceptance Criteria:
• HTML input field for question and answer. HTML to be parsed in UI.
• Allow line breaks in question and answer texts to be parsed.
• There was a very weird UI glitch for someone:',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   '2025-12-29', null, null, 6),

  ('60000000-0000-4000-8000-000000000185', '50000000-0000-4000-8000-000000000007', 'COD-185',
   'CR: Banner with News',
   'Acceptance Criteria:
• Option to hide Banner
• Allow line break in Main News text
• Remove padding from around the pic/media of Main News (to be full-width of container) —> add boolean property cover or as is now
• Let the left container of Main News and the right container of Side News be the same exact height. It can be a static height if it makes things easier.',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   '2025-12-29', null, null, 7),

  ('60000000-0000-4000-8000-000000000186', '50000000-0000-4000-8000-000000000007', 'COD-186',
   'CR: Quick Links Plus',
   'Acceptance Criteria:
• Icon is bigger, like this: (in my opinion, just make icon size dynamic with bigger default)
• Labels/text should be optional

o allow text field for each link to be blank
o add in DisplayMode the same 2 options withOUT text hidden

Add Button no text, Pill no text:
• Dropdown to align buttons horizontally (left, center, right).
o Example scenario: only 2 links added, they will currently be aligned left as they do not fill row, option to align them center would be nicer
• Quick Links Plus with display mode Pills/Rectangle is not responsive in a 1/3 column section',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   '2025-12-29', null, null, 8),

  ('60000000-0000-4000-8000-000000000187', '50000000-0000-4000-8000-000000000008', 'COD-187',
   'Banner with News',
   'Fix dark overlay on Header and Banner with News. (bug shows up only on narrow screens)

بص الصورة الصفرا مش على طبيعتها من ناحية اللون

screenshot from this page: http://evimwi.sharepoint.com/

Story 3: Banner with News

On narrow screens, button text is not vertically aligned properly. It works perfectly on wide screens.

Also from this page http://evimwi.sharepoint.com/',
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000188', '50000000-0000-4000-8000-000000000008', 'COD-188',
   'Quick Links',
   'Add a slider to allow custom images in Quick Links Plus to be scaled.',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000189', '50000000-0000-4000-8000-000000000009', 'COD-189',
   'Link Carousel',
   '• it must allow individuals and microsoft groups as well
• https://developer.microsoft.com/en-us/fluentui#/controls/web/peoplepicker',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000190', '50000000-0000-4000-8000-000000000009', 'COD-190',
   'Banner Half-Image',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000191', '50000000-0000-4000-8000-000000000009', 'COD-191',
   'New: Copier',
   'There is a new extension called Copier. I need you to review and improve UI and UX.

Some thoughts:',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000192', '50000000-0000-4000-8000-000000000009', 'COD-192',
   'Embed Plus',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000193', '50000000-0000-4000-8000-000000000009', 'COD-193',
   'Video Carousel',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 4),

  ('60000000-0000-4000-8000-000000000194', '50000000-0000-4000-8000-000000000009', 'COD-194',
   'Alerts.',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 5),

  ('60000000-0000-4000-8000-000000000195', '50000000-0000-4000-8000-000000000009', 'COD-195',
   'Quick Links',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 6),

  ('60000000-0000-4000-8000-000000000196', '50000000-0000-4000-8000-000000000009', 'COD-196',
   'Banner with News',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 7),

  ('60000000-0000-4000-8000-000000000197', '50000000-0000-4000-8000-000000000010', 'COD-197',
   'Finder',
   null,
   null,
   'dev_started', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000198', '50000000-0000-4000-8000-000000000010', 'COD-198',
   'Calendar',
   null,
   null,
   'dev_started', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000199', '50000000-0000-4000-8000-000000000010', 'COD-199',
   'New webpart: EVIM Lists',
   null,
   null,
   'dev_started', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000200', '50000000-0000-4000-8000-000000000010', 'COD-200',
   'Links Carousel',
   null,
   null,
   'dev_started', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000201', '50000000-0000-4000-8000-000000000011', 'COD-201',
   'Finder1',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000011', 'COD-202',
   'New webpart: EVIM Lists',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000203', '50000000-0000-4000-8000-000000000011', 'COD-203',
   'Calendar',
   '• Change line 309 in Calendar.tsx (https://github.com/MooTamer/microsoft-web-parts-final/blob/797eae05940d30ea6c877f7fdfd5b47ee56d0eaa/Calendar/src/webparts/calendar/components/Calendar.tsx#L309) to include ‘Workspace’ field
• If it exists, you will get in the response a value for workspace like this one:
• `{...,"Workspace":{"Description":"https://event.eu.on24.com/wcc/r/8000167270/F8824C968EEB4C387B6622662957973A","Url":"https://event.eu.on24.com/wcc/r/8000167270/F8824C968EEB4C387B6622662957973A (https://event.eu.on24.com/wcc/r/8000167270/F8824C968EEB4C387B6622662957973A%22,%22Url%22:%22https://event.eu.on24.com/wcc/r/8000167270/F8824C968EEB4C387B6622662957973A)"},...}`
• Parse the ‘Url’ property of ‘Workspace’ as a clickable “Link” field in the Calendar popup of an event
• If Workspace or Url do not exist, then do not include the Link field in the UI design (see design below)
• See UI design

@Mohamed Tamer @Mohamed Tamer check this out',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000204', '50000000-0000-4000-8000-000000000011', 'COD-204',
   'Links Carousel',
   null,
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000205', '50000000-0000-4000-8000-000000000012', 'COD-205',
   'Link Carousel: Make into grid',
   'Erik has the problem that the link carousel (the horizontal scrollbar) is not very user friendly on desktop in his opinion.

He wants on desktop for each section to be a separate grid, where the distance between each row in the grid and the next is EXACTLY the distance between each tile and the next horizontally.

On mobile it should stay exactly as it is, this carousel is very user-friendly on touch screens.',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000206', '50000000-0000-4000-8000-000000000012', 'COD-206',
   'Finder: Handle urls',
   '• use different Icon (➔)
• hide .url suffix
• hide file size and date created

See this screenshot:',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000207', '50000000-0000-4000-8000-000000000013', 'COD-207',
   'EVIM Banner: Intranet Mode Edits',
   'ALL changes Intranet mode. Do not touch Workplace

Replace “Department Name” with 2 text Fields “Titel” and “Thema”.
”Titel” defines word on the left. ”Thema” defines word on the right.',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000208', '50000000-0000-4000-8000-000000000013', 'COD-208',
   'EVIM Banner: Modes',
   'The customization settings are currently too much for some users. We want to create a predefined mode.

On top of the sidebar settings have a dropdown menu “Modes” with values “Intranet”, “Workplace”.

Mode “Intranet”:

Can upload picture in “Background Image URL”

“EVIM” in text predefined and rest of text in field “department name”

„EVIM“ predefined color night blue:

“department name” predefined color:

Behind the text there should be a white background.

Font „Assistant“ text size like in this page: https://evimwi.sharepoint.com/sites/EVIM-Kommunikation

mobile-responsive

Mode “Workplace”: Exactly what we have now

All modes new features:
• Zoom in, zoom out on background pic (slider)
• Horizontal slider
• Vertical slider',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000209', '50000000-0000-4000-8000-000000000014', 'COD-209',
   'EVIM LinkedIn and Instagram Backend',
   null,
   null,
   'todo', 'story',
   'a0000000-0000-4000-8000-000000000002', null,
   null, null, null, 0),

  ('60000000-0000-4000-8000-000000000210', '50000000-0000-4000-8000-000000000014', 'COD-210',
   'EVIM Locale unifying in Quick Links Plus',
   '• Create locale .json file which will be saved in Sharepoint
• Create webpart to edit .json locale
• Make field labels in Quick Links editable via locale
• Note: Check permissions',
   null,
   'in_review', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 1),

  ('60000000-0000-4000-8000-000000000211', '50000000-0000-4000-8000-000000000014', 'COD-211',
   'EVIM Collapser (restoring after mistake)',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 2),

  ('60000000-0000-4000-8000-000000000212', '50000000-0000-4000-8000-000000000014', 'COD-212',
   'EVIM Finder',
   'Change EVIM Finder name to “EVIM Dokumentenbibliothek”',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 3),

  ('60000000-0000-4000-8000-000000000213', '50000000-0000-4000-8000-000000000014', 'COD-213',
   'EVIM Tabs with Cards',
   '• Color Nachtblau
• Size 18
• evim redish arrow, Nachtblau bold text, size 18
• steps to reproduce
    1. click on edit button
    2. choose page 2 [second page , 2 of 3]
    3. choose any toggle for example the staff directory
    4. try to change the title

expected outcome → title got changed

actual outcome → the whole toggle collapse after each 1 char edit

can someone check that @Abdelrahman Elkhateeb  @Mohamed Tamer',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 4),

  ('60000000-0000-4000-8000-000000000214', '50000000-0000-4000-8000-000000000014', 'COD-214',
   'EVIM Button Link Plus',
   '• “Altenhilfe” —> Orange background color
• “Jugendhilfe” —> Grün background color
• “Teilhabe” —> Türkis background color
• “Bildung” —> Lila background color
• ”Verein” —> Apricot background color',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', null,
   null, null, null, 5),

  ('60000000-0000-4000-8000-000000000215', '50000000-0000-4000-8000-000000000014', 'COD-215',
   'EVIM Quick Links Plus',
   'Problem: Styling of quick links is too complex for user (2nd page in parameters of the webpart)
• screenshot

User wants 2 predefined “modes”. We will keep current settings in a “custom mode” as a third option.

Tasks:
• The dropdown has values “Blue pill” (default), “Red pill” and “Custom” ☑️
• change preconfiguredEntries.title.default in src/*/*/*.manifest.json

```json
    {
      "$schema": "https://developer.microsoft.com/json-schemas/spfx/client-side-web-part-manifest.schema.json",
      "id": "89480af8-f501-4126-bdf5-d08159947293",
      "alias": "AnniversariesWebPart",
      "componentType": "WebPart",

"version": "*",
      "manifestVersion": 2,

"requiresCustomScript": false,
      "supportedHosts": ["SharePointWebPart", "TeamsPersonalApp", "TeamsTab", "SharePointFullPage"],
      "supportsThemeVariants": true,

"preconfiguredEntries": [{
        "groupId": "e6c31b08-8b52-4e9b-93ab-8e2a1f63a777",
        "group": { "default": "EVIM Webparts" },
        "title": { "default": "EVIM Anniversaries" },
        "description": { "default": "Anniversaries description" },
        "officeFabricIconFontName": "Page",
        "properties": {
          "description": "Anniversaries"
        }
      }]
    }

```',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', null,
   null, null, null, 6),

  ('60000000-0000-4000-8000-000000000216', '50000000-0000-4000-8000-000000000014', 'COD-216',
   'EVIM Banner Intranet Mode',
   'Last week we added zoom in/out, horizontal and vertical positioning of photo in the EVIM Banner webpart.

Requested change in “Intranet” mode only:',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', null,
   null, null, null, 7),

  ('60000000-0000-4000-8000-000000000217', '50000000-0000-4000-8000-000000000015', 'COD-217',
   'req form',
   'digitalize the attached form to a react page

Anforderungs_Dok_1_v0.3.pdf

reference for corporate design: www.evim.de

Figma components to use: https://www.figma.com/design/n5OfGEb5H3CWL5TAvp8pzt/EVIM-Design-%C3%9Cbergabe?node-id=11901-28588&m=dev&t=5rL7Yo5lVJ4Y5AUH-1 (https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fn5OfGEb5H3CWL5TAvp8pzt%2FEVIM-Design-%25C3%259Cbergabe%3Fnode-id%3D11901-28588%26m%3Ddev%26t%3D5rL7Yo5lVJ4Y5AUH-1&data=05%7C02%7CAdam.Nafie%40evim.de%7C350013d413124792c2c908deec8eab8f%7C6ee46e2c3f30448695b94a4992d36536%7C0%7C0%7C639208295466026525%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=jzpYXcYgG32qyjNs5mxPwyb%2BC4ENMzoHBRzKkkvRXUs%3D&reserved=0)

Suggestion: make it an interactive form with steps if you think that fits',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   '2026-08-09', null, null, 0),

  ('60000000-0000-4000-8000-000000000218', '50000000-0000-4000-8000-000000000015', 'COD-218',
   'EVIM Link Kachel',
   'AC:

2 webparts

1.  the old one for backward  comp. [revert changes for commit 7af4c4e]
2. the new webpart in a separate file',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-09', null, null, 1),

  ('60000000-0000-4000-8000-000000000219', '50000000-0000-4000-8000-000000000015', 'COD-219',
   'Webparts bug',
   'Logging in to evimwi.sharepoint.com with

`Tea.Test@schuleamgeisberg.de`
Tea1978!

results in our webparts not being shown, but microsoft webparts are visible

this user in a different tenant but web parts should be independent from tenants',
   null,
   'done', 'bug_fix',
   'a0000000-0000-4000-8000-000000000004', null,
   '2026-08-09', null, null, 2),

  ('60000000-0000-4000-8000-000000000220', '50000000-0000-4000-8000-000000000016', 'COD-220',
   'EVIM Newspart',
   'https://evimwi.sharepoint.com/Lists/EVIM News Center/AllItems.aspx (https://evimwi.sharepoint.com/Lists/EVIM%20News%20Center/AllItems.aspx)
Edit in a copy of EVIM News Center webpart:
• EVIM
• Verein
• Jugendhilfe
• Altenhilfe
• Teilhabe
• Bildung
• MAV
• Use for each department its corporate color
• EVIM default department',
   null,
   'draft', 'story',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 0),

  ('60000000-0000-4000-8000-000000000221', '50000000-0000-4000-8000-000000000016', 'COD-221',
   'EVIM Newspart Changes',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 1),

  ('60000000-0000-4000-8000-000000000222', '50000000-0000-4000-8000-000000000016', 'COD-222',
   'EVIM Banner news mode',
   'All changes below in “News” mode only!!!
• Jugendhilfe
• Altenhilfe
• Teilhabe
• Bildung
• Verein

add input filed “id”',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 2),

  ('60000000-0000-4000-8000-000000000223', '50000000-0000-4000-8000-000000000016', 'COD-223',
   'Change all text color in ALL webparts to black',
   '• Replace Nachtblau only  in all webparts to black!!!!!!!
• if text isn’t Nachtblau for example white or anything else  leave it without change

@Mohamed Tamer Design system for sharepoint should use black not Nachtblau for text…
Affected components

| Component | Change |
| --- | --- |
| Banner | Nachtblau title text changed to black |
| EVIM Newspart | Department text fallback changed to black |
| Link Kachel | Title, description, and placeholder text changed to black |
| Tabs with Cards | Title, body, and link-label text changed to black; existing Nachtblau defaults migrate to black |
| ButtonLinkPlus | EVIM shared text token changed to black |
| Collapser | EVIM shared text token changed to black |
| EVIM Locale Editor | EVIM shared text token changed to black |
| Quick Links Plus | EVIM shared text token changed to black |
| Design system | Added an explicit EVIM black text token |
| Custom-brand validation | Brands without `color.text` continue deriving accessible text from their surface |
| Regression tests | Added coverage preventing black text on dark custom surfaces |

Nachtblau backgrounds, borders, shadows, accents, and category colors remain unchanged.',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   '2026-08-17', null, null, 3),

  ('60000000-0000-4000-8000-000000000224', '50000000-0000-4000-8000-000000000016', 'COD-224',
   '[REACT] EVIM News Redakteurseite',
   'React app to manage following sharepoint list (rows are news articles, columns are shown below)

Auswahl—>Dropdown

Datum —> Date

AC:
• Be able to see and edit old news in list and add new news in list
• Be able to draft news and publish them
• Show news by department (use evim corporate colors for each department [figma])
• Each news has teaser text, headline, category, department, editor, Link to image, link to news
• Everything in German!!
• Placeholder values first
• Deploy and send link to test (will forward to EVIM for immediate feedback)

Deployed at: https://evim-redaktion.vercel.app/',
   null,
   'done', 'story',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-14', null, null, 4),

  ('60000000-0000-4000-8000-000000000225', '50000000-0000-4000-8000-000000000016', 'COD-225',
   'EVIM Tabs with Cards',
   '• Goal: to be like Link Kachel (make sure), also on hover',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 5),

  ('60000000-0000-4000-8000-000000000226', '50000000-0000-4000-8000-000000000016', 'COD-226',
   'EVIM Akkordeon (Collapser)',
   null,
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 6),

  ('60000000-0000-4000-8000-000000000227', '50000000-0000-4000-8000-000000000016', 'COD-227',
   'EVIM Link Kachel',
   '• do u mean alignment for the text inside the card ? @adam
• @Ahmed Yehia ignore this requirement for now. because now we''re going to display the Kachels in a grid. we didn''t dicuss this in the call, but i added it immediately after',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-17', null, null, 7),

  ('60000000-0000-4000-8000-000000000228', '50000000-0000-4000-8000-000000000016', 'COD-228',
   'EVIM Quick Links Plus',
   'All changes below are for red and blue pill modes `ONLY`  while leaving other modes without changes',
   null,
   'done', 'change_request',
   'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   '2026-08-17', null, null, 8),

  ('60000000-0000-4000-8000-000000000229', '50000000-0000-4000-8000-000000000017', 'COD-229',
   'Add optional titles to all webparts',
   'We want to add a unified optional title field to all webparts.

Acceptance Criteria:',
   null,
   'in_review', 'story',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-23', null, null, 0),

  ('60000000-0000-4000-8000-000000000230', '50000000-0000-4000-8000-000000000017', 'COD-230',
   'Tabs with Cards',
   'Change title font size to 22px',
   null,
   'ready_for_peer_review', 'change_request',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-23', null, null, 1),

  ('60000000-0000-4000-8000-000000000231', '50000000-0000-4000-8000-000000000017', 'COD-231',
   'Tabs with Cards: height logic fix',
   'The height logic is great, thank you for implementing last time. We have an issue though:

When you add 4 cards and the 4th card does not have any description, it overflows to a new row but its height is different to the heights in the first row.

Expected behavior:',
   null,
   'ready_for_peer_review', 'bug_fix',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-23', null, 1, 2),

  ('60000000-0000-4000-8000-000000000232', '50000000-0000-4000-8000-000000000017', 'COD-232',
   'Link Kachel changes',
   '• Our goal is to avoid this space as much as possible:',
   null,
   'ready_for_peer_review', 'change_request',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
   '2026-08-23', null, 1, 3),

  ('60000000-0000-4000-8000-000000000233', '50000000-0000-4000-8000-000000000017', 'COD-233',
   'Newspart changes',
   null,
   null,
   'dev_started', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   '2026-08-23', null, 2, 4),

  ('60000000-0000-4000-8000-000000000234', '50000000-0000-4000-8000-000000000017', 'COD-234',
   'Banner News Mode',
   'Implement all the following changes only in News mode. Our goal is to carryover the Banner Half-Image webpart with EVIM corporate design to our Banner News mode logic:

row 1: date     <pill with department name>

row 2: Category with bigger font size

row 3: Title with biggest font size (do not change its current size)

row 4: Teaser',
   null,
   'dev_started', 'change_request',
   'a0000000-0000-4000-8000-000000000001', null,
   '2026-08-23', null, 2, 5),

  ('60000000-0000-4000-8000-000000000235', '50000000-0000-4000-8000-000000000017', 'COD-235',
   'Responsiveness for Link Kachel, Tabs with Cards, Newspart',
   'Link Kachel:

Link Kachel, Tabs with Cards, Newspart:

In all 3 webparts I have cards which are shown in a grid (In Newspart the card takes up all the grid columns). I want unified responsiveness logic for all the 3 webparts IF AND ONLY IF there is more than 1 card defined.',
   null,
   'ready_for_peer_review', 'story',
   'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   '2026-08-23', null, null, 6),

  ('60000000-0000-4000-8000-000000000236', '50000000-0000-4000-8000-000000000017', 'COD-236',
   'Calendar',
   'We want to update EVIM Calendar webpart. Really important: We will be displaying the EVIM calendar in 1 column next to EVIM Newspart in 2 columns. Please make sure the UI and UX of both calendar and newspart are fitting. Follow Corporate Design from Figma',
   'Below the AC for EVIM Calendar new mode “Startseite”, please only make changes in this mode!!',
   'dev_started', 'story',
   'a0000000-0000-4000-8000-000000000003', null,
   '2026-08-23', null, null, 7),

  ('60000000-0000-4000-8000-000000000237', '50000000-0000-4000-8000-000000000017', 'COD-237',
   'Unifying pill button: arrow and animation',
   'The EVIM pill button used is in Quick Links Plus, Link Kachel and Newspart

Acceptance Criteria:

Technical Requirement:',
   null,
   'todo', 'story',
   null, null,
   '2026-08-23', null, null, 8),

  ('60000000-0000-4000-8000-000000000238', '50000000-0000-4000-8000-000000000017', 'COD-238',
   'Banner Intranet Mode',
   'In Banner Intranet mode change the right part of the title back to Nachtblau from black.',
   null,
   'todo', 'change_request',
   null, null,
   '2026-08-23', null, null, 9),

  ('60000000-0000-4000-8000-000000000239', '50000000-0000-4000-8000-000000000017', 'COD-239',
   '[React] Redakteurseite',
   null,
   null,
   'draft', 'change_request',
   null, null,
   '2026-08-23', null, null, 10),

  ('60000000-0000-4000-8000-000000000240', '50000000-0000-4000-8000-000000000017', 'COD-240',
   'Rollover Contact Cards',
   null,
   null,
   'todo', 'change_request',
   null, null,
   '2026-08-23', null, null, 11),

  ('60000000-0000-4000-8000-000000000241', '50000000-0000-4000-8000-000000000017', 'COD-241',
   'Quick Links Plus Open New Tab bug',
   'When Open New Tab for a link is toggled, any link with base URL evimwi.sharepoint.com does not open in a new tab.

Expected behavior:

After fixing this bug please contact me so that we can solve this for all webparts as this is a recurring issue!!!',
   null,
   'todo', 'bug_fix',
   null, null,
   '2026-08-23', null, null, 12),

  ('60000000-0000-4000-8000-000000000242', '50000000-0000-4000-8000-000000000017', 'COD-242',
   '[React] Redakteurkalendar',
   'As a Redakteur I want to have an internal calendar to plan',
   null,
   'draft', 'story',
   null, null,
   null, null, null, 13),

  ('60000000-0000-4000-8000-000000000243', '51000000-0000-4000-8000-000000000001', 'COD-243',
   'Evaluate existing frontend performance',
   '• login: [redacted]
• pass: [redacted] [redacted] PLEASE KEEP SECRET',
   null,
   'todo', 'story',
   null, null,
   '2025-03-02', null, null, 0);

-- Keep the sequence ahead of the transcribed keys. Without this a new item
-- collides with one of them on its very first insert.
select setval('public.work_item_key_seq', 244, false);


-- ---------------------------------------------------------------------------
-- Acceptance criteria. Notion checkboxes, including which are already ticked.
-- Nested checklists are flattened with a leading em dash per level.
-- ---------------------------------------------------------------------------

insert into public.acceptance_criteria (work_item_id, body, is_done, order_index) values
  ('60000000-0000-4000-8000-000000000145', 'Color of border and button background to be determined by “Sidebar background” property, default: d80345', true, 0),
  ('60000000-0000-4000-8000-000000000145', 'deploy', true, 1),
  ('60000000-0000-4000-8000-000000000146', 'Text and details color to be dynamic', true, 0),
  ('60000000-0000-4000-8000-000000000146', 'deploy', true, 1),
  ('60000000-0000-4000-8000-000000000147', 'User feedback when in focus has blue border, change it to d80345', true, 0),
  ('60000000-0000-4000-8000-000000000147', 'deploy', true, 1),
  ('60000000-0000-4000-8000-000000000148', 'Text of “See additional xx folders”, see less text and all other english text should be dynamic', true, 0),
  ('60000000-0000-4000-8000-000000000148', 'deploy', true, 1),
  ('60000000-0000-4000-8000-000000000149', 'Remove css gray background', true, 0),
  ('60000000-0000-4000-8000-000000000149', 'Deploy', true, 1),
  ('60000000-0000-4000-8000-000000000150', 'Video in second post is not working, I changed the link in the cache to https://streamable.com/e/0ijuf2, still not working', true, 0),
  ('60000000-0000-4000-8000-000000000150', 'Date is being passed from backend as string, just put the string directly. Do not parse.', true, 1),
  ('60000000-0000-4000-8000-000000000150', 'Remove “Referrer policy” from sidepane', true, 2),
  ('60000000-0000-4000-8000-000000000150', 'What is “number of cards” supposed to do?', true, 3),
  ('60000000-0000-4000-8000-000000000150', 'On narrow screens make carousel previous and next button better positioned, maybe even just remove entirely as on narrow screen we usually swipe', true, 4),
  ('60000000-0000-4000-8000-000000000150', 'Change “Max media grid columns” dropdown to “Media Grid Style”. Remove 1 column option', true, 5),
  ('60000000-0000-4000-8000-000000000150', 'Change “Card size” dropdown to “Caption size”. Options: “Concise”, “Full”. If “Concise”, then after 500 characters add a ‘… Read More’ dynamic text which shows the rest of the text upon clicking and a ‘Read less’ dynamic text to collapse the text back. If “Full”, show all text from the get go.', true, 6),
  ('60000000-0000-4000-8000-000000000150', 'Remove refresh button', true, 7),
  ('60000000-0000-4000-8000-000000000150', 'Default Font: Assistant, sans-serif', true, 8),
  ('60000000-0000-4000-8000-000000000150', 'Default accent: d80345', true, 9),
  ('60000000-0000-4000-8000-000000000154', 'Create new webpart called “Header” that only includes the “Banner” from Banner with News', true, 0),
  ('60000000-0000-4000-8000-000000000154', 'Include all properties that concern banner (background, text and banner height)', true, 1),
  ('60000000-0000-4000-8000-000000000155', 'Cards that show Accounts from the Active Directory', false, 0),
  ('60000000-0000-4000-8000-000000000155', 'The cards will be organized from the side pane using ‘Levels’ and in each level', false, 1),
  ('60000000-0000-4000-8000-000000000155', '— Levels are the vertical layers, acting as a y-axis. Groups are each connected', false, 2),
  ('60000000-0000-4000-8000-000000000155', '— Each group has a label (to be shown like in the pic above (dotted line))', false, 3),
  ('60000000-0000-4000-8000-000000000155', '— Each group has a color', false, 4),
  ('60000000-0000-4000-8000-000000000155', '— Employees can be added by PeoplePicker field directly in the level (no group)', false, 5),
  ('60000000-0000-4000-8000-000000000155', '— Employees can be added in a group within a level (PeoplePicker field)', false, 6),
  ('60000000-0000-4000-8000-000000000155', '— Each group (in all levels but first) has a ‘predecessor’ , also a PeoplePicker', false, 7),
  ('60000000-0000-4000-8000-000000000155', 'Cards should have following info:', false, 8),
  ('60000000-0000-4000-8000-000000000155', '— User Pic', false, 9),
  ('60000000-0000-4000-8000-000000000155', '— Display Name', false, 10),
  ('60000000-0000-4000-8000-000000000155', '— If clicked on mailto: link', false, 11),
  ('60000000-0000-4000-8000-000000000156', 'Javascript or embed code to be pasted in property pane gets compiled when', true, 0),
  ('60000000-0000-4000-8000-000000000157', 'Modern UI', true, 0),
  ('60000000-0000-4000-8000-000000000157', '— Navigation bar controlled by a dedicated folder with subfolders and/or .url files', true, 1),
  ('60000000-0000-4000-8000-000000000157', '— Subfolders represent dropdown. Assume only subfolders on root level allowed.', true, 2),
  ('60000000-0000-4000-8000-000000000157', '— Folders and files only appear to those they are shared with (I think this should be', true, 3),
  ('60000000-0000-4000-8000-000000000157', '— Dynamic properties/styling need to be controlled from somewhere (sidepane if', true, 4),
  ('60000000-0000-4000-8000-000000000157', '— — Logo', true, 5),
  ('60000000-0000-4000-8000-000000000157', '— — Colors', true, 6),
  ('60000000-0000-4000-8000-000000000157', '— — Font (Assistant, sans-serif default)', true, 7),
  ('60000000-0000-4000-8000-000000000173', 'UI Improvements', false, 0),
  ('60000000-0000-4000-8000-000000000173', '— center x in circle', true, 1),
  ('60000000-0000-4000-8000-000000000173', '— add simple shadow? i don’t know it just looks too flat', false, 2),
  ('60000000-0000-4000-8000-000000000173', '— left border looks odd', true, 3),
  ('60000000-0000-4000-8000-000000000173', '— Color Picker', true, 4),
  ('60000000-0000-4000-8000-000000000173', '— rich text editor needs to be more user friendly, don’t spend a lot of time on this (bold italic underline link)', true, 5),
  ('60000000-0000-4000-8000-000000000189', 'Add PeoplePicker property “Visible only for”', true, 0),
  ('60000000-0000-4000-8000-000000000189', 'If empty, webpart visible for everyone', true, 1),
  ('60000000-0000-4000-8000-000000000189', 'If people selected, only to those people', true, 2),
  ('60000000-0000-4000-8000-000000000190', 'Make eyebrow color dynamic (default: white)', false, 0),
  ('60000000-0000-4000-8000-000000000191', 'Selection boxes need UX improvement', true, 0),
  ('60000000-0000-4000-8000-000000000191', 'Loading after clicking on “copy”', true, 1),
  ('60000000-0000-4000-8000-000000000191', 'Improve text spacing to the left of copy button', true, 2),
  ('60000000-0000-4000-8000-000000000191', 'Improve success/error message', true, 3),
  ('60000000-0000-4000-8000-000000000192', 'remove gray border', false, 0),
  ('60000000-0000-4000-8000-000000000193', 'Remove white fade/overlay (example: Softgarden x EVIM – Homepage (https://evimwi.sharepoint.com/sites/EVIM-Softgarden-BMS?xsdata=MDV8MDJ8fDdmNjViZWMzZWI2ZTQ5NzMxMzRlMDhkZTZhMzdlM2U0fDZlZTQ2ZTJjM2YzMDQ0ODY5NWI5NGE0OTkyZDM2NTM2fDB8MHw2MzkwNjQ5ODU0MTIzMDk4Mzh8VW5rbm93bnxWR1ZoYlhOVFpXTjFjbWwwZVZObGNuWnBZMlY4ZXlKRFFTSTZJbFJsWVcxelgwRlVVRk5sY25acFkyVmZVMUJQVEU5R0lpd2lWaUk2SWpBdU1DNHdNREF3SWl3aVVDSTZJbGRwYmpNeUlpd2lRVTRpT2lKUGRHaGxjaUlzSWxkVUlqb3hNWDA9fDF8TDJOb1lYUnpMekU1T20xbFpYUnBibWRmV21wYWExcFVVVEZaYWxWMFRtMVJkMDVwTURCT2VrSnNURmRHYVZwVVJYUlBSRmt6V21wSk5FNTZTbXhaVjAwMFFIUm9jbVZoWkM1Mk1pOXRaWE56WVdkbGN5OHhOemN3T1RBeE56TTVNakUzfGEwZGYyNzNlM2EzMDRkZWExMzRlMDhkZTZhMzdlM2U0fDQ4MmY2ODQwMzM2MTRkOTM5ZDA4ZWMyZjk5MmYyZTZk&sdata=K0NEM2p3cU9LRnY4aUk3YjFnandERFFBR2JESml4blRjSGphb1RMQ2VSQT0%3D&ovuser=6ee46e2c-3f30-4486-95b9-4a4992d36536%2Ch90-anafie%40evim.de))', false, 0),
  ('60000000-0000-4000-8000-000000000194', 'X in Alerts extension to be centered', false, 0),
  ('60000000-0000-4000-8000-000000000195', 'Option to reduce spaces between icons in Quick Links Plus', false, 0),
  ('60000000-0000-4000-8000-000000000196', 'Option to toggle Banner on and off in Banner with News', false, 0),
  ('60000000-0000-4000-8000-000000000197', 'English text (folder, files) should be German', false, 0),
  ('60000000-0000-4000-8000-000000000197', 'On pc with maximized window there are 4 folders per row in the grid, but when you open a folder, you see only 3 subfolders per row in the grid. Is there extra padding here that makes the grid smaller?', false, 1),
  ('60000000-0000-4000-8000-000000000198', 'English text in popup to be (Wann? Was? Wo?) instead of (Time Description Location)', false, 0),
  ('60000000-0000-4000-8000-000000000198', 'Popup not mobile-responsive', false, 1),
  ('60000000-0000-4000-8000-000000000199', 'Parse dates to be hh:mm dd.mm.yy', false, 0),
  ('60000000-0000-4000-8000-000000000199', 'Parse links to be clickable', false, 1),
  ('60000000-0000-4000-8000-000000000200', 'users not in Global target audience should not see carousel at all, now the title is still visible for them. For example open evimwi.sharepoint.com/sites/Personal (http://evimwi.sharepoint.com/sites/Personal) you will see "Digitale Personalprozesse" title with no links, we need the whole webpart to be hidden for nonselected people', false, 0),
  ('60000000-0000-4000-8000-000000000201', 'English text (folder, files) should be German', true, 0),
  ('60000000-0000-4000-8000-000000000201', 'On pc with maximized window there are 4 folders per row in the grid, but when you open a folder, you see only 3 subfolders per row in the grid. Is there extra padding here that makes the grid smaller?', true, 1),
  ('60000000-0000-4000-8000-000000000201', 'New req: Sort files by alphabetical order of filenames', true, 2),
  ('60000000-0000-4000-8000-000000000201', 'New req: When .url files are clicked, the link should open (in same tab) @Mohamed Tamer @Mohamed Tamer', true, 3),
  ('60000000-0000-4000-8000-000000000202', 'Parse dates to be hh:mm dd.mm.yy', false, 0),
  ('60000000-0000-4000-8000-000000000202', 'Parse links to be clickable', false, 1),
  ('60000000-0000-4000-8000-000000000203', 'English text in popup to be (Wann? Was? Wo?) instead of (Time Calendar Location)… Also “Beschreibung” instead of ”Description”', true, 0),
  ('60000000-0000-4000-8000-000000000203', 'Popup not mobile-responsive', true, 1),
  ('60000000-0000-4000-8000-000000000203', 'Links in section ‘Was?’ should be clickable', true, 2),
  ('60000000-0000-4000-8000-000000000203', 'Add ‘Workspace’ to fetched fields', false, 3),
  ('60000000-0000-4000-8000-000000000203', 'Change popup UI to be like this', false, 4),
  ('60000000-0000-4000-8000-000000000204', 'users not in Global target audience should not see carousel at all, now the title is still visible for them. For example open evimwi.sharepoint.com/sites/Personal (http://evimwi.sharepoint.com/sites/Personal) you will see "Digitale Personalprozesse" title with no links, we need the whole webpart to be hidden for nonselected people', true, 0),
  ('60000000-0000-4000-8000-000000000206', 'If a file is .url:', false, 0),
  ('60000000-0000-4000-8000-000000000207', 'Switch colors for left and right words as in photo above.', false, 0),
  ('60000000-0000-4000-8000-000000000207', 'Use font  *Assistant Extrabold as in photo above for both words*', false, 1),
  ('60000000-0000-4000-8000-000000000207', 'Remove Banner Height slider and make it predefined to have value 30', false, 2),
  ('60000000-0000-4000-8000-000000000207', 'Remove big space between left and right words', false, 3),
  ('60000000-0000-4000-8000-000000000211', 'Change name to EVIM Akkordeon  ☑️', false, 0),
  ('60000000-0000-4000-8000-000000000211', 'Question text size: Heading 3 ☑️', false, 1),
  ('60000000-0000-4000-8000-000000000211', 'Answer text size: 18 ☑️', false, 2),
  ('60000000-0000-4000-8000-000000000211', 'Remove Font size slider from side pane  ☑️', false, 3),
  ('60000000-0000-4000-8000-000000000211', 'Add bar like outlook to make text bold/italic and to use ordered and unordered lists ☑️', false, 4),
  ('60000000-0000-4000-8000-000000000211', 'Change border to to Nachtblau and remove shadows ☑️', false, 5),
  ('60000000-0000-4000-8000-000000000213', 'Title color: Nachtblau ☑️', false, 0),
  ('60000000-0000-4000-8000-000000000213', 'Title size: Heading 3 (but also customizable) ☑️', false, 1),
  ('60000000-0000-4000-8000-000000000213', 'Optional description ☑️', false, 2),
  ('60000000-0000-4000-8000-000000000213', 'Optional link ☑️', false, 3),
  ('60000000-0000-4000-8000-000000000213', 'Carousel currently fits only 3 cards in a view, it should fit 4 ☑️', false, 4),
  ('60000000-0000-4000-8000-000000000213', 'The cards should always be of the same size ☑️', false, 5),
  ('60000000-0000-4000-8000-000000000213', 'NEW BUG → editing the title collapse the tab', true, 6),
  ('60000000-0000-4000-8000-000000000214', 'Remove all current settings', false, 0),
  ('60000000-0000-4000-8000-000000000214', 'New webpart name: EVIM Link Kachel (change preconfiguredEntries.title.default in src/*/*/*.manifest.json) ☑️', false, 1),
  ('60000000-0000-4000-8000-000000000214', 'Text color predefined as Nachtblau ☑️', false, 2),
  ('60000000-0000-4000-8000-000000000214', 'Dropdown field “Bereich” with options:  ☑️', false, 3),
  ('60000000-0000-4000-8000-000000000214', 'Mandatory Title ”Überschrift” text field ☑️', false, 4),
  ('60000000-0000-4000-8000-000000000214', 'Optional description multiline text field ☑️', false, 5),
  ('60000000-0000-4000-8000-000000000214', 'Optional link field, if link is added show the button “Zum Download” as in version 3 below ☑️', false, 6),
  ('60000000-0000-4000-8000-000000000214', 'fetch from www.evim.de, espically animation', false, 7),
  ('60000000-0000-4000-8000-000000000214', 'On hover, the button changes to this (check www.evim.de) ☑️', false, 8),
  ('60000000-0000-4000-8000-000000000215', 'In the styling page of webpart settings (2nd page) add at the top the dropdown “Modes”', false, 0),
  ('60000000-0000-4000-8000-000000000215', 'If Blue pill is chosen then predefine AND DO NOT SHOW the styling settings such that the buttons look like this  (icon is dynamic, but not its color) ☑️', false, 1),
  ('60000000-0000-4000-8000-000000000215', 'If Red pill is chosen then predefine AND DO NOT SHOW the styling settings such that the buttons look like this  (icon is dynamic, but not its color) ☑️', false, 2),
  ('60000000-0000-4000-8000-000000000215', 'Change name of webpart to EVIM Link Buttons ☑️', false, 3),
  ('60000000-0000-4000-8000-000000000216', 'Disregard zoom in/out, horizontal and vertical positioning of photo in mobile.', false, 0),
  ('60000000-0000-4000-8000-000000000218', 'Separate EVIM Button Link Plus changes from last week to new webpart called EVIM Link Kachel.', false, 0),
  ('60000000-0000-4000-8000-000000000218', 'Reverse all changes in EVIM Button Link Plus to commit 7af4c4e', false, 1),
  ('60000000-0000-4000-8000-000000000220', '`create a copy from  EVIM News Center webpart [the EXCAT code just copy]`', true, 0),
  ('60000000-0000-4000-8000-000000000220', 'Name of copy: EVIM Newspart', true, 1),
  ('60000000-0000-4000-8000-000000000220', 'create a new list and get it’s link', true, 2),
  ('60000000-0000-4000-8000-000000000220', 'Remove data source settings [step 1] , make it a predefined list [the example one u created step before] so the UI doesn’t have the data source settings but the backend hard code the exmaple data source', true, 3),
  ('60000000-0000-4000-8000-000000000220', '`We will rename step 2 from “Categories” to departments`', true, 4),
  ('60000000-0000-4000-8000-000000000220', 'Predefine department and department colors (per design system):', true, 5),
  ('60000000-0000-4000-8000-000000000220', 'Remove Categories and Colors from sidepane', false, 6),
  ('60000000-0000-4000-8000-000000000220', 'We will add a new “tag” next to “department”', false, 7),
  ('60000000-0000-4000-8000-000000000220', '— Call the tag setting “category”', false, 8),
  ('60000000-0000-4000-8000-000000000220', 'the 2 tags in colors of departments', false, 9),
  ('60000000-0000-4000-8000-000000000220', '— department', false, 10),
  ('60000000-0000-4000-8000-000000000220', '— category', false, 11),
  ('60000000-0000-4000-8000-000000000220', 'remove all news, EVIM is the all news', false, 12),
  ('60000000-0000-4000-8000-000000000220', 'Each News can be given more than one department/tag', false, 13),
  ('60000000-0000-4000-8000-000000000220', 'Remove step 3 and hardcode:', true, 14),
  ('60000000-0000-4000-8000-000000000220', '— News items per page: fix 3 news card next to each other', true, 15),
  ('60000000-0000-4000-8000-000000000220', '— Title font size heading 3', true, 16),
  ('60000000-0000-4000-8000-000000000220', '— Teaser/body text size 18', true, 17),
  ('60000000-0000-4000-8000-000000000220', '— Text color black', true, 18),
  ('60000000-0000-4000-8000-000000000220', '— Background white', true, 19),
  ('60000000-0000-4000-8000-000000000220', 'Remove add news card button', true, 20),
  ('60000000-0000-4000-8000-000000000221', 'Change the filters to be like in the Redaktionsseite (layout & department names):', true, 0),
  ('60000000-0000-4000-8000-000000000221', '“Alle News” filter in addition to the other filters', true, 1),
  ('60000000-0000-4000-8000-000000000221', 'Show cards vertically not horizontally', true, 2),
  ('60000000-0000-4000-8000-000000000221', '— picture on left side', true, 3),
  ('60000000-0000-4000-8000-000000000221', '— Replace Author with category in text, while department tag stays as it is', true, 4),
  ('60000000-0000-4000-8000-000000000221', '— Make sure it looks perfect in two third columns', true, 5),
  ('60000000-0000-4000-8000-000000000221', '— Bottom right put arrow like this with label “Mehr”', true, 6),
  ('60000000-0000-4000-8000-000000000221', 'Do not capitalize department tag in a card', true, 7),
  ('60000000-0000-4000-8000-000000000221', 'Bottom right next to page picker: “Mehr News anzeigen”', true, 8),
  ('60000000-0000-4000-8000-000000000221', 'Make sure animation of cards is like: https://www.evim.de/presse', true, 9),
  ('60000000-0000-4000-8000-000000000222', 'Add new mode in EVIM Banner: “News”', true, 0),
  ('60000000-0000-4000-8000-000000000222', 'Show date, title', true, 1),
  ('60000000-0000-4000-8000-000000000222', 'Show tags topic, department', true, 2),
  ('60000000-0000-4000-8000-000000000222', '— make the corners semi circles per design system', true, 3),
  ('60000000-0000-4000-8000-000000000222', 'Department dropdown field with values', true, 4),
  ('60000000-0000-4000-8000-000000000222', 'Based on department choose banner color', true, 5),
  ('60000000-0000-4000-8000-000000000222', 'Text color black', true, 6),
  ('60000000-0000-4000-8000-000000000222', 'Title font assistant bold with same size and type as in mode “intranet”', true, 7),
  ('60000000-0000-4000-8000-000000000222', 'Add 2nd page to sidepane', true, 8),
  ('60000000-0000-4000-8000-000000000222', '— Add sliders for font size', true, 9),
  ('60000000-0000-4000-8000-000000000222', '— Add color picker for text colors', true, 10),
  ('60000000-0000-4000-8000-000000000225', 'Change name to “EVIM Themen Kachel”', false, 0),
  ('60000000-0000-4000-8000-000000000225', 'Remove background gradient (solid white)', false, 1),
  ('60000000-0000-4000-8000-000000000225', 'Remove tabs and remove tab name (aka no grouping)', false, 2),
  ('60000000-0000-4000-8000-000000000225', 'Predefine font size of card title to heading 3 (sharepoint standard 24)', false, 3),
  ('60000000-0000-4000-8000-000000000225', 'Predefine font color to black', false, 4),
  ('60000000-0000-4000-8000-000000000225', 'Predefine card body text to be size 18 (sharepoint standard), normal', false, 5),
  ('60000000-0000-4000-8000-000000000225', 'Fix card alignment', false, 6),
  ('60000000-0000-4000-8000-000000000225', '— Card to be 1/3 pic 2/3 text', false, 7),
  ('60000000-0000-4000-8000-000000000225', '— padding between link and text to be same as padding between test and title', false, 8),
  ('60000000-0000-4000-8000-000000000225', '— limit characters in sidepane to ensure fixed height', false, 9),
  ('60000000-0000-4000-8000-000000000225', 'Change from Carousel to grid (EVIM want each row to have exactly 4 cards…)', false, 10),
  ('60000000-0000-4000-8000-000000000225', 'Redesign to evim design system', false, 11),
  ('60000000-0000-4000-8000-000000000225', 'Link icon arrow to be ChromeBackMirrored', false, 12),
  ('60000000-0000-4000-8000-000000000225', 'Fluent UI sidepane to add cards intuitively', false, 13),
  ('60000000-0000-4000-8000-000000000225', 'Remove settings in 3rd sidepane page and add fluentui settings:', false, 14),
  ('60000000-0000-4000-8000-000000000225', '— slider for title size', false, 15),
  ('60000000-0000-4000-8000-000000000225', '— slider body text size', false, 16),
  ('60000000-0000-4000-8000-000000000225', '— text color picker', false, 17),
  ('60000000-0000-4000-8000-000000000226', 'Question font size to be default “Heading 3” (`by Sharepoint standard 24`)', true, 0),
  ('60000000-0000-4000-8000-000000000226', 'Answer font type normal with default size 18 (`Sharepoint standard`)', true, 1),
  ('60000000-0000-4000-8000-000000000226', 'Add sliders on sidepane second page', true, 2),
  ('60000000-0000-4000-8000-000000000226', '— slider for font size of question', true, 3),
  ('60000000-0000-4000-8000-000000000226', '— slider for font size of answer', true, 4),
  ('60000000-0000-4000-8000-000000000226', 'Arrow and border should be the same color', true, 5),
  ('60000000-0000-4000-8000-000000000226', '— use field “Chevron color” as basis (do not fix border color)', true, 6),
  ('60000000-0000-4000-8000-000000000226', 'Make corners semi circle (pill)', true, 7),
  ('60000000-0000-4000-8000-000000000227', '[No Code change required] Which font size is used in the title and description? Please answer in Sharepoint standards', false, 0),
  ('60000000-0000-4000-8000-000000000227', 'Using FluentUI sidepane settings, allow adding new Link Kachels in a grid. A row on desktop should take 3 cards. @Mohamed Tamer I told them your idea and they liked it.', false, 1),
  ('60000000-0000-4000-8000-000000000227', 'In the download button use icon ChromeBackMirrored icon instead of this right arrow', false, 2),
  ('60000000-0000-4000-8000-000000000227', '— make sure it is scaled like in this photo relative to the text', false, 3),
  ('60000000-0000-4000-8000-000000000227', 'Make Zum Download button to be pill exactly as in Quick Links Plus and pic above [aka rounded]', false, 4),
  ('60000000-0000-4000-8000-000000000227', 'add example data `in German`for the new empty link kachle', false, 5),
  ('60000000-0000-4000-8000-000000000227', 'width should remain the same for both 30% or 100% of the section', false, 6),
  ('60000000-0000-4000-8000-000000000227', 'Maximum character count for description field: 30 characters', false, 7),
  ('60000000-0000-4000-8000-000000000227', 'Reduce Padding between Zum Download and description to be as the padding between title and description', false, 8),
  ('60000000-0000-4000-8000-000000000227', 'Make sure height is fixed with and without link based on the padding and maximum character count described above', false, 9),
  ('60000000-0000-4000-8000-000000000227', 'right, center, left alignment option', false, 10),
  ('60000000-0000-4000-8000-000000000227', 'remove text adjs.', true, 11),
  ('60000000-0000-4000-8000-000000000227', 'adjust the fulet ui like EVIM Link Buttons', true, 12),
  ('60000000-0000-4000-8000-000000000228', 'Make sure padding right of the blue and red pill modes is same as padding left', false, 0),
  ('60000000-0000-4000-8000-000000000228', 'Decrease font size to size 18 by `Sharepoint standards!!` Please inspect in Sharepoint to understand what this standard is.', false, 1),
  ('60000000-0000-4000-8000-000000000228', 'Decrease height of buttons (padding top and bottom seem to be too much)', false, 2),
  ('60000000-0000-4000-8000-000000000228', 'Modes currently are globally set, we want to be able to override specifically for each link', false, 3),
  ('60000000-0000-4000-8000-000000000228', '— per link here we should have a drop down menu to override the global one, the drop down menu for the modes', false, 4),
  ('60000000-0000-4000-8000-000000000229', 'In each webpart there is a toggle at the very top of the settings “Show Title” (”Überschrift anzeigen”)', false, 0),
  ('60000000-0000-4000-8000-000000000229', 'The “Show Title” toggle is on by default', false, 1),
  ('60000000-0000-4000-8000-000000000229', 'When the “Show Title” toggle is on, then the title should show above the webpart directly.', false, 2),
  ('60000000-0000-4000-8000-000000000229', 'When ?Mode=Edit then the title should be editable from the webpart directly like in screenshot below, with same options', false, 3),
  ('60000000-0000-4000-8000-000000000229', 'When toggle is on, make sure your implementation behaves exactly like the Title which is added when adding Sharepoint standard Webpart “Events” for example. PLEASE do not implement before trying out the “Events” webpart. This is an AC.', false, 4),
  ('60000000-0000-4000-8000-000000000231', 'All Link Kachels must have same height, even if they are not in same row', false, 0),
  ('60000000-0000-4000-8000-000000000231', 'The height is determined by the Link Kachel which has the most text (the least acceptable height for it to show properly)', false, 1),
  ('60000000-0000-4000-8000-000000000231', 'There is no min height', false, 2),
  ('60000000-0000-4000-8000-000000000232', 'Change character limit for text to be 85 chars instead of 30 chars', false, 0),
  ('60000000-0000-4000-8000-000000000232', 'Überschrift font size to be fixed at 22px', false, 1),
  ('60000000-0000-4000-8000-000000000232', 'Add toggle “Button Link” in specific Link Kachel settings', false, 2),
  ('60000000-0000-4000-8000-000000000232', '— If toggle on, show extra a text field “Linkbeschriftung” which is the label of the pill by default “Zum Download”', false, 3),
  ('60000000-0000-4000-8000-000000000232', '— If toggle off, do not show text field “Linkbeschriftung” and do not show the “Zum Download” pill at all', false, 4),
  ('60000000-0000-4000-8000-000000000232', 'Decrease height of Link Kachel. We want the height logic to work like the logic from “Tabs with Cards” webpart:', false, 5),
  ('60000000-0000-4000-8000-000000000232', '— All Link Kachels must have same height, even if they are not in same row', false, 6),
  ('60000000-0000-4000-8000-000000000232', '— The height is determined by the Link Kachel which has the most text (the least acceptable height for it to show properly)', false, 7),
  ('60000000-0000-4000-8000-000000000232', '— There is no min height', false, 8),
  ('60000000-0000-4000-8000-000000000233', 'Change name to “EVIM News”', false, 0),
  ('60000000-0000-4000-8000-000000000233', 'We want to make the filter pills have less padding so they’re less bulky. We want to stick to evim corporate design', false, 1),
  ('60000000-0000-4000-8000-000000000233', '— Remove filter pill min height', false, 2),
  ('60000000-0000-4000-8000-000000000233', '— make the top-bottom padding --evimds-space-200', false, 3),
  ('60000000-0000-4000-8000-000000000233', '— make right-left padding --evimds-space-150', false, 4),
  ('60000000-0000-4000-8000-000000000233', '— please contact me after implementing to talk about this for future implementation', false, 5),
  ('60000000-0000-4000-8000-000000000233', 'Filter pills starting from Vorstand till the end should have Aprikot color instead of EVIM Kirschrot', false, 6),
  ('60000000-0000-4000-8000-000000000233', 'Completely replace “Kommunikation” department with “MAV”', false, 7),
  ('60000000-0000-4000-8000-000000000233', 'Completely remove department “Servicestelle Drittmittel”', false, 8),
  ('60000000-0000-4000-8000-000000000233', 'We want to change where the “category” is shown. In the example screenshot below the category is “test”. We want it to show in a separate row before the title with size 16px and bold style. Date and Department pill stay the same', false, 9),
  ('60000000-0000-4000-8000-000000000233', 'Remove any sharp corners and make all the corners round with roundness of Link Kachel.', false, 10),
  ('60000000-0000-4000-8000-000000000233', '— Basically: Replicate the on hover shape to be standard. Remove any animation to the news card', false, 11),
  ('60000000-0000-4000-8000-000000000233', '— Please make sure roundness is visually unified everywhere as Newspart shouldn’t appear different than Link Kachel nor Tabs with Cards!!!', false, 12),
  ('60000000-0000-4000-8000-000000000233', 'On narrow screens:', false, 13),
  ('60000000-0000-4000-8000-000000000233', '— Replace filter pills with a pill dropdown with the same style and padding', false, 14),
  ('60000000-0000-4000-8000-000000000234', 'Make sure Banner is same width across ALL modes.', false, 0),
  ('60000000-0000-4000-8000-000000000234', '— Currently News mode is narrower than Intranet mode for example', false, 1),
  ('60000000-0000-4000-8000-000000000234', 'News Banner should be same height as Intranet mode', false, 2),
  ('60000000-0000-4000-8000-000000000234', 'Right side of the banner should be the image fetched from the list with same ratio as banner half-image', false, 3),
  ('60000000-0000-4000-8000-000000000234', '— Corners of image all rounded', false, 4),
  ('60000000-0000-4000-8000-000000000234', '— I personally prefer the following way of representing the image, but Vanessa prefers the screenshot above. Can you show us a comparison between both?', false, 5),
  ('60000000-0000-4000-8000-000000000234', 'MAV department to take EVIM beige department color', false, 6),
  ('60000000-0000-4000-8000-000000000234', 'Layout from the upper left corner to be like the text in the news part', false, 7),
  ('60000000-0000-4000-8000-000000000234', 'Change text color in entire news mode to Nachtblau', false, 8),
  ('60000000-0000-4000-8000-000000000235', 'When I add a single Link Kachel in a section with 3 or 2 columns it is not filling up the entire space. I want it to fill up the entire space.', false, 0),
  ('60000000-0000-4000-8000-000000000235', 'For more than 1 card we want to have a swipe carousel similar to instagram posts with slides.', false, 1),
  ('60000000-0000-4000-8000-000000000235', '— We already implemented this for Banner and News webpart before, as well as LinkedIn Feed and Instagram Feed. We want to carry over the “dots”', false, 2),
  ('60000000-0000-4000-8000-000000000235', '— Make sure the cards still appear in the carousel with same shape (EVIM shape)', false, 3),
  ('60000000-0000-4000-8000-000000000235', 'Add a toggle to be able to display the cards below each other instead of in a carousel, but carousel by default', false, 4),
  ('60000000-0000-4000-8000-000000000236', 'Create Mode “Startseite” for EVIM Calendar, current mode becomes “Custom” and custom is default mode', false, 0),
  ('60000000-0000-4000-8000-000000000236', 'Hardcode 1 Calendar and remove page 2 (Calendar Sources) from the sidepane entirely', false, 1),
  ('60000000-0000-4000-8000-000000000236', '— The hardcoded calendar has a “Bereich” property', false, 2),
  ('60000000-0000-4000-8000-000000000236', 'Ability to filter shown Events by Bereich', false, 3),
  ('60000000-0000-4000-8000-000000000236', 'Shown events take on a color based on department', false, 4),
  ('60000000-0000-4000-8000-000000000236', '— Text color is black (even for date)', false, 5),
  ('60000000-0000-4000-8000-000000000236', '— Pill background color takes on department color (also EVIM pill shape)', false, 6),
  ('60000000-0000-4000-8000-000000000236', '— The points in the calendar should also take the color of the department', false, 7),
  ('60000000-0000-4000-8000-000000000236', 'Set max height of Calendar to height of EVIM Newspart (which is fixed)', false, 8),
  ('60000000-0000-4000-8000-000000000236', 'Only starting current show 4 weeks (4 rows with calendar numbers)', false, 9),
  ('60000000-0000-4000-8000-000000000236', '— Only show Sunday and Saturday if there is an event on these days', false, 10),
  ('60000000-0000-4000-8000-000000000236', 'Display date in <Day abbreviation>, dd.mm.yy format', false, 11),
  ('60000000-0000-4000-8000-000000000236', '— day abbreviation in German', false, 12),
  ('60000000-0000-4000-8000-000000000236', '— Example: Fr, 06.08.26', false, 13),
  ('60000000-0000-4000-8000-000000000236', 'German locale:', false, 14),
  ('60000000-0000-4000-8000-000000000237', 'Arrow is the same svg and boldness in all pills. The correct arrow is currently in Quick Links Plus', false, 0),
  ('60000000-0000-4000-8000-000000000237', 'Animation on hover is same in all pills. The correct animation is currently in Link Kachel (text moves to the right)', false, 1),
  ('60000000-0000-4000-8000-000000000237', 'Have a unified css class and/or components for buttons of this type', false, 2),
  ('60000000-0000-4000-8000-000000000239', 'Filter pills from Vorstand till IT&Digitalisierung are switched from EVIM Kirschrot to EVIM Aprikot color', false, 0),
  ('60000000-0000-4000-8000-000000000239', '— Filter pills on start page', false, 1),
  ('60000000-0000-4000-8000-000000000239', '— Filter pills after clicking “Neuer Beitrag”', false, 2),
  ('60000000-0000-4000-8000-000000000239', 'Completely replace “Kommunikation” department with “MAV”', false, 3),
  ('60000000-0000-4000-8000-000000000239', 'Completely remove department “Servicestelle Drittmittel”', false, 4),
  ('60000000-0000-4000-8000-000000000239', 'In “Kategorie” dropdown add the option “Veranstaltung”', false, 5),
  ('60000000-0000-4000-8000-000000000240', 'Remove username Adam.Nafie', false, 0),
  ('60000000-0000-4000-8000-000000000241', 'When open new tab is toggled on anywhere, then ALL links regardless of base url should open in a new tab', false, 0),
  ('60000000-0000-4000-8000-000000000243', 'Home page: https://www.converso.ai/', false, 0),
  ('60000000-0000-4000-8000-000000000243', 'Platform for testing: https://develop.app.converso.ai/', false, 1);


-- ---------------------------------------------------------------------------
-- Logged time.
--
-- Invariant 2: integer minutes. Notion holds one "Hours Worked" total per item
-- and no daily breakdown, so each item becomes exactly one entry, attributed to
-- its assignee. `worked_on` is the item's own deadline where it has one, else
-- the sprint's last day; for the nine sprints with no datable window it is the
-- earliest day the work provably could have happened, and the note says so.
-- ---------------------------------------------------------------------------

insert into public.time_entries (work_item_id, profile_id, minutes, worked_on, note) values
  ('60000000-0000-4000-8000-000000000159', 'a0000000-0000-4000-8000-000000000001', 960, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000160', 'a0000000-0000-4000-8000-000000000004', 1020, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000161', 'a0000000-0000-4000-8000-000000000002', 240, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000162', 'a0000000-0000-4000-8000-000000000003', 180, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000163', 'a0000000-0000-4000-8000-000000000003', 900, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000164', 'a0000000-0000-4000-8000-000000000003', 540, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000165', 'a0000000-0000-4000-8000-000000000004', 900, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000166', 'a0000000-0000-4000-8000-000000000001', 300, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000167', 'a0000000-0000-4000-8000-000000000001', 30, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000168', 'a0000000-0000-4000-8000-000000000001', 30, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000169', 'a0000000-0000-4000-8000-000000000001', 30, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000170', 'a0000000-0000-4000-8000-000000000001', 240, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000171', 'a0000000-0000-4000-8000-000000000001', 30, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000172', 'a0000000-0000-4000-8000-000000000003', 360, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000173', 'a0000000-0000-4000-8000-000000000003', 480, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000174', 'a0000000-0000-4000-8000-000000000003', 60, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000175', 'a0000000-0000-4000-8000-000000000003', 300, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000176', 'a0000000-0000-4000-8000-000000000001', 420, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000177', 'a0000000-0000-4000-8000-000000000003', 90, '2025-11-17', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000178', 'a0000000-0000-4000-8000-000000000003', 60, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000179', 'a0000000-0000-4000-8000-000000000001', 240, '2025-12-28', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000180', 'a0000000-0000-4000-8000-000000000003', 120, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000181', 'a0000000-0000-4000-8000-000000000003', 300, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000182', 'a0000000-0000-4000-8000-000000000003', 120, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000183', 'a0000000-0000-4000-8000-000000000001', 240, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000184', 'a0000000-0000-4000-8000-000000000003', 120, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000185', 'a0000000-0000-4000-8000-000000000001', 420, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000186', 'a0000000-0000-4000-8000-000000000001', 180, '2025-12-29', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000189', 'a0000000-0000-4000-8000-000000000003', 120, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000190', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000191', 'a0000000-0000-4000-8000-000000000003', 240, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000192', 'a0000000-0000-4000-8000-000000000003', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000193', 'a0000000-0000-4000-8000-000000000003', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000194', 'a0000000-0000-4000-8000-000000000001', 300, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000195', 'a0000000-0000-4000-8000-000000000001', 180, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000196', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000199', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000001', 240, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000203', 'a0000000-0000-4000-8000-000000000001', 240, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000204', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000205', 'a0000000-0000-4000-8000-000000000001', 240, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000206', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000207', 'a0000000-0000-4000-8000-000000000001', 60, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000208', 'a0000000-0000-4000-8000-000000000003', 300, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000210', 'a0000000-0000-4000-8000-000000000003', 180, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000211', 'a0000000-0000-4000-8000-000000000004', 210, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000212', 'a0000000-0000-4000-8000-000000000001', 30, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000213', 'a0000000-0000-4000-8000-000000000004', 210, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000214', 'a0000000-0000-4000-8000-000000000001', 390, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000215', 'a0000000-0000-4000-8000-000000000004', 330, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000216', 'a0000000-0000-4000-8000-000000000003', 120, '2025-12-29', 'Imported from Notion — one sprint total; the exact day was never recorded'),
  ('60000000-0000-4000-8000-000000000218', 'a0000000-0000-4000-8000-000000000001', 30, '2026-08-09', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000220', 'a0000000-0000-4000-8000-000000000004', 600, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000221', 'a0000000-0000-4000-8000-000000000003', 240, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000222', 'a0000000-0000-4000-8000-000000000004', 330, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000223', 'a0000000-0000-4000-8000-000000000004', 90, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000224', 'a0000000-0000-4000-8000-000000000004', 810, '2026-08-14', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000225', 'a0000000-0000-4000-8000-000000000001', 330, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000226', 'a0000000-0000-4000-8000-000000000004', 120, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000227', 'a0000000-0000-4000-8000-000000000004', 210, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000228', 'a0000000-0000-4000-8000-000000000004', 210, '2026-08-17', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000229', 'a0000000-0000-4000-8000-000000000001', 480, '2026-08-23', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000230', 'a0000000-0000-4000-8000-000000000001', 30, '2026-08-23', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000231', 'a0000000-0000-4000-8000-000000000001', 120, '2026-08-23', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000232', 'a0000000-0000-4000-8000-000000000001', 180, '2026-08-23', 'Imported from Notion — one sprint total, not a daily log'),
  ('60000000-0000-4000-8000-000000000235', 'a0000000-0000-4000-8000-000000000003', 240, '2026-08-23', 'Imported from Notion — one sprint total, not a daily log');


-- ---------------------------------------------------------------------------
-- Attachments.
--
-- Rows only. The bytes live in the private `work-attachments` bucket and are
-- pushed there by scripts/upload-notion-attachments.mjs, which has to run again
-- after `db:reset` — resetting the database clears `storage.objects` even
-- though the files themselves survive.
-- ---------------------------------------------------------------------------

insert into public.attachments (work_item_id, storage_path, file_name, mime_type, bytes, uploaded_by) values
  ('60000000-0000-4000-8000-000000000145', '60000000-0000-4000-8000-000000000145/0-image.png', 'image.png', 'image/png', 35952, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000146', '60000000-0000-4000-8000-000000000146/0-image.png', 'image.png', 'image/png', 882249, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000147', '60000000-0000-4000-8000-000000000147/0-image.png', 'image.png', 'image/png', 11188, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000150', '60000000-0000-4000-8000-000000000150/0-image-9.png', 'image 9.png', 'image/png', 614661, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000153', '60000000-0000-4000-8000-000000000153/0-c590ea65f5a0b9d49b3ca7fdb2c88f195b7981fe.gif', 'c590ea65f5a0b9d49b3ca7fdb2c88f195b7981fe.gif', 'image/gif', 1369822, 'a0000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000154', '60000000-0000-4000-8000-000000000154/0-image.png', 'image.png', 'image/png', 434295, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000155', '60000000-0000-4000-8000-000000000155/0-cleanshot-2025-11-12-at-13.28.14.png', 'CleanShot_2025-11-12_at_13.28.14.png', 'image/png', 196036, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000156', '60000000-0000-4000-8000-000000000156/0-image.png', 'image.png', 'image/png', 57920, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000157', '60000000-0000-4000-8000-000000000157/0-cleanshot-2025-11-12-at-13.33.15.png', 'CleanShot_2025-11-12_at_13.33.15.png', 'image/png', 59507, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000159', '60000000-0000-4000-8000-000000000159/0-image.png', 'image.png', 'image/png', 846226, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000160', '60000000-0000-4000-8000-000000000160/0-image.png', 'image.png', 'image/png', 188991, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000162', '60000000-0000-4000-8000-000000000162/0-image.png', 'image.png', 'image/png', 248572, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000163', '60000000-0000-4000-8000-000000000163/0-image.png', 'image.png', 'image/png', 80699, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000164', '60000000-0000-4000-8000-000000000164/0-image.png', 'image.png', 'image/png', 293807, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000165', '60000000-0000-4000-8000-000000000165/0-image.png', 'image.png', 'image/png', 62667, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000167', '60000000-0000-4000-8000-000000000167/0-cleanshot-2025-11-29-at-17.58.29.png', 'CleanShot_2025-11-29_at_17.58.29.png', 'image/png', 24625, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000167', '60000000-0000-4000-8000-000000000167/1-cleanshot-2025-11-29-at-18.21.02.png', 'CleanShot_2025-11-29_at_18.21.02.png', 'image/png', 543905, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000168', '60000000-0000-4000-8000-000000000168/0-cleanshot-2025-11-29-at-18.22.03.png', 'CleanShot_2025-11-29_at_18.22.03.png', 'image/png', 72896, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000169', '60000000-0000-4000-8000-000000000169/0-cleanshot-2025-11-29-at-18.00.33.png', 'CleanShot_2025-11-29_at_18.00.33.png', 'image/png', 202488, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000170', '60000000-0000-4000-8000-000000000170/0-cleanshot-2025-11-29-at-18.01.41.png', 'CleanShot_2025-11-29_at_18.01.41.png', 'image/png', 320820, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000171', '60000000-0000-4000-8000-000000000171/0-cleanshot-2025-11-29-at-18.24.35.png', 'CleanShot_2025-11-29_at_18.24.35.png', 'image/png', 177122, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000171', '60000000-0000-4000-8000-000000000171/1-arc-2025-11-29-18.24.17.png', 'Arc_2025-11-29_18.24.17.png', 'image/png', 150302, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000172', '60000000-0000-4000-8000-000000000172/0-image.png', 'image.png', 'image/png', 173876, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000173', '60000000-0000-4000-8000-000000000173/0-image.png', 'image.png', 'image/png', 92552, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000173', '60000000-0000-4000-8000-000000000173/1-image-1.png', 'image 1.png', 'image/png', 77310, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000173', '60000000-0000-4000-8000-000000000173/2-image-2.png', 'image 2.png', 'image/png', 320046, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000174', '60000000-0000-4000-8000-000000000174/0-image.png', 'image.png', 'image/png', 6531, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000175', '60000000-0000-4000-8000-000000000175/0-image.png', 'image.png', 'image/png', 34801, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000177', '60000000-0000-4000-8000-000000000177/0-cleanshot-2025-11-29-at-18.05.51.png', 'CleanShot_2025-11-29_at_18.05.51.png', 'image/png', 446367, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000177', '60000000-0000-4000-8000-000000000177/1-arc-2025-11-29-18.05.49.png', 'Arc_2025-11-29_18.05.49.png', 'image/png', 299307, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000179', '60000000-0000-4000-8000-000000000179/0-image.png', 'image.png', 'image/png', 43315, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000179', '60000000-0000-4000-8000-000000000179/1-image-1.png', 'image 1.png', 'image/png', 30627, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000180', '60000000-0000-4000-8000-000000000180/0-image.png', 'image.png', 'image/png', 9144, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000182', '60000000-0000-4000-8000-000000000182/0-image.png', 'image.png', 'image/png', 170915, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000183', '60000000-0000-4000-8000-000000000183/0-image.png', 'image.png', 'image/png', 159529, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000183', '60000000-0000-4000-8000-000000000183/1-image-1.png', 'image 1.png', 'image/png', 6439, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000184', '60000000-0000-4000-8000-000000000184/0-image.png', 'image.png', 'image/png', 16325, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000186', '60000000-0000-4000-8000-000000000186/0-image.png', 'image.png', 'image/png', 2245, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000187', '60000000-0000-4000-8000-000000000187/0-image.png', 'image.png', 'image/png', 314991, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000188', '60000000-0000-4000-8000-000000000188/0-image.png', 'image.png', 'image/png', 61067, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000190', '60000000-0000-4000-8000-000000000190/0-image.png', 'image.png', 'image/png', 357900, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000192', '60000000-0000-4000-8000-000000000192/0-image.png', 'image.png', 'image/png', 574474, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000193', '60000000-0000-4000-8000-000000000193/0-image.png', 'image.png', 'image/png', 176016, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000194', '60000000-0000-4000-8000-000000000194/0-image.png', 'image.png', 'image/png', 49428, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000195', '60000000-0000-4000-8000-000000000195/0-image.png', 'image.png', 'image/png', 32141, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000196', '60000000-0000-4000-8000-000000000196/0-image.png', 'image.png', 'image/png', 710551, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000203', '60000000-0000-4000-8000-000000000203/0-image.png', 'image.png', 'image/png', 140395, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000205', '60000000-0000-4000-8000-000000000205/0-image.png', 'image.png', 'image/png', 197561, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000206', '60000000-0000-4000-8000-000000000206/0-image.png', 'image.png', 'image/png', 43042, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000207', '60000000-0000-4000-8000-000000000207/0-image.png', 'image.png', 'image/png', 37428, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000207', '60000000-0000-4000-8000-000000000207/1-image-1.png', 'image 1.png', 'image/png', 9189, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000208', '60000000-0000-4000-8000-000000000208/0-image.png', 'image.png', 'image/png', 164519, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000208', '60000000-0000-4000-8000-000000000208/1-image-1.png', 'image 1.png', 'image/png', 16880, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000208', '60000000-0000-4000-8000-000000000208/2-image-2.png', 'image 2.png', 'image/png', 20200, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000211', '60000000-0000-4000-8000-000000000211/0-image.png', 'image.png', 'image/png', 197782, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000213', '60000000-0000-4000-8000-000000000213/0-image.png', 'image.png', 'image/png', 5166, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000213', '60000000-0000-4000-8000-000000000213/1-screenshot-2026-08-04-at-8.17.06-pm.png', 'Screenshot_2026-08-04_at_8.17.06_PM.png', 'image/png', 243270, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000214', '60000000-0000-4000-8000-000000000214/0-image.png', 'image.png', 'image/png', 74523, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000214', '60000000-0000-4000-8000-000000000214/1-image-1.png', 'image 1.png', 'image/png', 70171, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000214', '60000000-0000-4000-8000-000000000214/2-image-2.png', 'image 2.png', 'image/png', 7310, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000215', '60000000-0000-4000-8000-000000000215/0-image.png', 'image.png', 'image/png', 20709, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000215', '60000000-0000-4000-8000-000000000215/1-image-1.png', 'image 1.png', 'image/png', 14572, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000215', '60000000-0000-4000-8000-000000000215/2-image-2.png', 'image 2.png', 'image/png', 8934, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000217', '60000000-0000-4000-8000-000000000217/0-anforderungs-dok-1-v0.3.pdf', 'Anforderungs_Dok_1_v0.3.pdf', 'application/pdf', 299235, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000219', '60000000-0000-4000-8000-000000000219/0-image.png', 'image.png', 'image/png', 8479, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000220', '60000000-0000-4000-8000-000000000220/0-image.png', 'image.png', 'image/png', 9183, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000220', '60000000-0000-4000-8000-000000000220/1-image-1.png', 'image 1.png', 'image/png', 40998, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000221', '60000000-0000-4000-8000-000000000221/0-image.png', 'image.png', 'image/png', 18244, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000221', '60000000-0000-4000-8000-000000000221/1-image-1.png', 'image 1.png', 'image/png', 3179, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000221', '60000000-0000-4000-8000-000000000221/2-image-2.png', 'image 2.png', 'image/png', 10553, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000222', '60000000-0000-4000-8000-000000000222/0-image.png', 'image.png', 'image/png', 13910, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000222', '60000000-0000-4000-8000-000000000222/1-image-1.png', 'image 1.png', 'image/png', 5292, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000222', '60000000-0000-4000-8000-000000000222/2-image-2.png', 'image 2.png', 'image/png', 23619, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000224', '60000000-0000-4000-8000-000000000224/0-image.png', 'image.png', 'image/png', 19701, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000225', '60000000-0000-4000-8000-000000000225/0-image.png', 'image.png', 'image/png', 191298, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000225', '60000000-0000-4000-8000-000000000225/1-image-1.png', 'image 1.png', 'image/png', 9292, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000226', '60000000-0000-4000-8000-000000000226/0-image.png', 'image.png', 'image/png', 21076, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000227', '60000000-0000-4000-8000-000000000227/0-image.png', 'image.png', 'image/png', 4178, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000227', '60000000-0000-4000-8000-000000000227/1-image-1.png', 'image 1.png', 'image/png', 57616, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000227', '60000000-0000-4000-8000-000000000227/2-image-2.png', 'image 2.png', 'image/png', 14435, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000227', '60000000-0000-4000-8000-000000000227/3-image-3.png', 'image 3.png', 'image/png', 9860, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000228', '60000000-0000-4000-8000-000000000228/0-image.png', 'image.png', 'image/png', 9603, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000228', '60000000-0000-4000-8000-000000000228/1-image-1.png', 'image 1.png', 'image/png', 33198, 'a0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000229', '60000000-0000-4000-8000-000000000229/0-image.png', 'image.png', 'image/png', 44505, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000232', '60000000-0000-4000-8000-000000000232/0-image.png', 'image.png', 'image/png', 27229, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000232', '60000000-0000-4000-8000-000000000232/1-image-1.png', 'image 1.png', 'image/png', 12953, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000233', '60000000-0000-4000-8000-000000000233/0-image.png', 'image.png', 'image/png', 20360, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000233', '60000000-0000-4000-8000-000000000233/1-image-1.png', 'image 1.png', 'image/png', 31927, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000233', '60000000-0000-4000-8000-000000000233/2-image-2.png', 'image 2.png', 'image/png', 80032, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000234', '60000000-0000-4000-8000-000000000234/0-image.png', 'image.png', 'image/png', 175843, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000234', '60000000-0000-4000-8000-000000000234/1-image-1.png', 'image 1.png', 'image/png', 122883, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000234', '60000000-0000-4000-8000-000000000234/2-image-2.png', 'image 2.png', 'image/png', 1026729, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000234', '60000000-0000-4000-8000-000000000234/3-image-3.png', 'image 3.png', 'image/png', 31927, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000235', '60000000-0000-4000-8000-000000000235/0-image.png', 'image.png', 'image/png', 18574, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000235', '60000000-0000-4000-8000-000000000235/1-image-1.png', 'image 1.png', 'image/png', 439, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000235', '60000000-0000-4000-8000-000000000235/2-image-2.png', 'image 2.png', 'image/png', 32355, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000236', '60000000-0000-4000-8000-000000000236/0-image.png', 'image.png', 'image/png', 30845, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000236', '60000000-0000-4000-8000-000000000236/1-image-1.png', 'image 1.png', 'image/png', 735, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000236', '60000000-0000-4000-8000-000000000236/2-image-2.png', 'image 2.png', 'image/png', 24390, 'a0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000237', '60000000-0000-4000-8000-000000000237/0-image.png', 'image.png', 'image/png', 3412, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000238', '60000000-0000-4000-8000-000000000238/0-image.png', 'image.png', 'image/png', 169569, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000239', '60000000-0000-4000-8000-000000000239/0-image.png', 'image.png', 'image/png', 37048, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000240', '60000000-0000-4000-8000-000000000240/0-image.png', 'image.png', 'image/png', 43819, 'a0000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000242', '60000000-0000-4000-8000-000000000242/0-image.png', 'image.png', 'image/png', 53321, 'a0000000-0000-4000-8000-000000000001');
