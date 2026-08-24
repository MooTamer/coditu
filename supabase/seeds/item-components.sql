-- Coditu — attributing the imported work to components.
--
-- ## What this is
--
-- Fifteen sprints of EVIM work were imported from Notion before the component
-- registry existed, so the web part an item changed lives only in its TITLE:
-- "Fix: tabs with cards", "CR: Banner Half-Image", "EVIM Quick Links Plus".
-- This reads those titles once and fills `work_items.component_id`.
--
-- It is a JUDGEMENT, not a derived fact — which is why it is hand-written and
-- reviewable rather than generated. Three rules keep it honest:
--
--  1. **It only ever fills a NULL.** Anything a person has already attributed,
--     in the app or by hand, is left exactly as it is. Running this file twice
--     changes nothing the second time, and correcting a row in the UI is
--     permanent.
--
--  2. **A phrase carries a priority, so a specific name beats a generic one.**
--     "Banner Half-Image" is the Half Image web part, not the Banner; "Tabs with
--     Cards" is Themen Kachel, not Tabs. Without priorities the generic word
--     would make every one of those look ambiguous.
--
--  3. **Ambiguous means UNATTRIBUTED.** If two different components match at the
--     same priority the item is left alone, because it genuinely is about two
--     of them: "CR: Instagram / LinkedIn Feed", "Responsiveness for Link Kachel,
--     Tabs with Cards, Newspart", "Add optional titles to all webparts". A
--     wrong attribution is worse than an empty one — the whole point of the
--     column is that a component's history can be trusted.
--
-- ## Why it matches on TITLE and not on item key
--
-- The local seed and the hosted database assign DIFFERENT `COD-` numbers to the
-- same item — the import ran twice, against two databases, with two sequences.
-- A file of `update … where key = 'COD-187'` would therefore attribute the
-- wrong rows in production while looking perfect locally. Titles are the same
-- text in both, so this file is safe to run against either.
--
-- `supabase/config.toml` runs it after `seeds/components.sql`. Against the
-- hosted project it is one idempotent statement, safe to paste as it is.

with alias (slug, phrase, priority) as (values
  -- ── 1 · Disambiguators ────────────────────────────────────────────────────
  -- Phrases that must beat a shorter, more generic one further down.
  ('evim-banner',                 'banner without news',           1),
  ('evim-banner-half-image',      'banner half',                   1),
  ('evim-banner-and-news',        'banner with news',              1),
  ('evim-banner-and-news',        'banner and news',               1),
  ('evim-banner-and-news',        'banner news',                   1),
  ('evim-themen-kachel',          'tabs with cards',               1),
  ('evim-news-center',            'news center',                   1),
  ('evim-news',                   'newspart',                      1),
  ('evim-link-kachel',            'link kachel',                   1),
  ('evim-link-buttons',           'quick links',                   1),
  ('evim-button-link',            'button link',                   1),
  ('evim-carousel-with-links',    'carousel with expanding links', 1),
  ('evim-carousel-with-links',    'expanding links',               1),
  ('evim-links-carousel',         'links carousel',                1),
  ('evim-links-carousel',         'link carousel',                 1),
  ('evim-video-carousel',         'video carousel',                1),
  ('evim-interactive-video',      'interactive video',             1),
  ('evim-rollover-contact-cards', 'contact cards',                 1),
  ('evim-akkordeon',              'akkordeon',                     1),
  ('evim-akkordeon',              'collapser',                     1),
  ('evim-dokumentenbibliothek',   'finder',                        1),
  ('evim-locale-editor',          'locale editor',                 1),
  -- The React app. "Redakteurkalendar" is spelled with an a in one title, so
  -- the phrase stops before the vowel that moved.
  ('news-redaktion',              'redakteurseite',                1),
  ('redakteurkalender',           'redakteurkalend',               1),

  -- ── 2 · Plain names ───────────────────────────────────────────────────────
  ('evim-process-and-timeline',   'process and timeline',          2),
  ('evim-heading-and-separator',  'heading and separator',         2),
  ('evim-linkedin-feed',          'linkedin',                      2),
  ('evim-instagram-feed',         'instagram',                     2),
  ('evim-user-feedback',          'user feedback',                 2),
  ('evim-anniversaries',          'anniversaries',                 2),
  -- Spelled "Anniverseries" in one sprint. Keeping the typo here is cheaper
  -- than rewriting somebody's history to match our spelling.
  ('evim-anniversaries',          'anniverseries',                 2),
  ('evim-org-chart',              'org chart',                     2),
  ('evim-embed-plus',             'embed plus',                    2),
  ('evim-main-navigation',        'main navigation',               2),
  ('evim-social-corner',          'social corner',                 2),
  ('evim-kpi-and-metrics',        'kpi and metrics',               2),
  ('evim-lists',                  'evim lists',                    2),
  ('evim-search-banner',          'search banner',                 2),
  ('evim-people-directory',       'people directory',              2),
  ('copier',                      'copier',                        2),
  ('urgent-alert',                'urgent alert',                  2),
  ('promo-alert',                 'promo alert',                   2),
  ('evim-poll',                   'poll',                          2),
  ('evim-calendar',               'calendar',                      2),

  -- ── 3 · Last resorts ──────────────────────────────────────────────────────
  -- One word that is also part of four other component names. Only reached when
  -- nothing above matched, which is what makes "CR: Banner" land correctly.
  ('evim-banner',                 'banner',                        3),
  ('evim-tabs',                   'tabs',                          3)
),

hit as (
  select w.id as item_id, c.id as component_id, a.priority
  from public.work_items w
  join public.sprints s    on s.id = w.sprint_id
  join public.projects p   on p.id = s.project_id
  join alias a             on position(a.phrase in lower(w.title)) > 0
  join public.components c on c.project_id = p.id and c.slug = a.slug
  where p.slug = 'meinevim'
    -- Rule 1. Never overwrite a person.
    and w.component_id is null
),

best as (
  select item_id, min(priority) as priority from hit group by item_id
),

-- Rule 3. Exactly one component at the winning priority, or nothing.
unambiguous as (
  -- `array_agg(distinct …)[1]` rather than `min()`: Postgres has no min() for
  -- uuid, and the HAVING below guarantees there is exactly one to take.
  select h.item_id, (array_agg(distinct h.component_id))[1] as component_id
  from hit h
  join best b on b.item_id = h.item_id and b.priority = h.priority
  group by h.item_id
  having count(distinct h.component_id) = 1
)

update public.work_items w
set component_id = u.component_id
from unambiguous u
where u.item_id = w.id;
