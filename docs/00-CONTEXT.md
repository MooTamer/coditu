# 00 — Context

Who Coditu is, what may be said about them, and what must never ship. Source: `coditu-revamp-prompt.md`
§1–§2, which remains authoritative for voice, positioning, and company facts.

---

## The company

Coditu is a distributed engineering team with hubs in **Germany and Egypt**. Four people. They design,
build, launch, and keep running:

- **Enterprise portals in the Microsoft ecosystem** — SPFx components, SharePoint Online, governance
  and permission models.
- **Internal business systems** — approvals, scheduling, reporting, role-based operational software.
- **AI assistants using RAG** — ingestion, indexing, answer guardrails, workflow actions.
- **Web applications** — Next.js product surfaces, partner portals, operations dashboards.
- **Performance and technical SEO** — Core Web Vitals, metadata structure, performance budgets.

They are not an agency that subcontracts. One team owns discovery through post-launch iteration.

## The real work — use these, invent nothing

| Project | Client / context | What it was |
|---|---|---|
| MEINEvim internal SharePoint components | EVIM, Germany — enterprise | Reusable SPFx component set replacing fragmented legacy widgets |
| Nile Atelier partner portal | Egypt — clothing manufacturing | Partner onboarding, document routing, shared visibility |
| Ops Console | DevOps / infrastructure | Unified Vue 3 dashboard over Redis, Pinecone, S3, PostgreSQL, AI services |
| NVRMiss | B2B SaaS / field services | Product landing for a 24/7 AI receptionist — lead qualification, booking, calendar sync |

## The team

| Name | Role | Base |
|---|---|---|
| Mohamed Tamer | Frontend Lead — UI/UX, motion, design systems, frontend architecture | Cairo, EG |
| Adam Nafie | Client Partnerships Lead — discovery, solution design, roadmapping, QA | Munich, DE |
| Abdelrahman Elkhateeb | Frontend Engineer — performance (CWV), technical SEO, scalable UI | Cairo, EG |
| Ahmed Yehia | Backend & DevOps — APIs, CI/CD, databases, infrastructure, RAG pipelines | Ulm, DE |

Locations are **Munich · Ulm · Cairo**. There is nobody in Berlin. The current site says Berlin; that is
a bug, not a fact.

Contact: `hello@coditu.com`.

---

## Voice

The register: a senior engineer explaining precisely what they build and how, to a technical buyer who
has been burned before. Confidence comes from **specificity**, not adjectives. "SPFx components inside
existing SharePoint governance" beats "innovative enterprise solutions" every single time.

**Do not inflate.** Banned: *world-class, cutting-edge, revolutionary, industry-leading, 10x, seamless,
unlock, empower, leverage, transform your business, we're passionate about.* No invented metrics
("300% faster", "50+ clients"). No logo wall. No invented testimonials.

**Do not shrink either.** Never *"we're just a small team", "boutique", "humble", "we may be small
but"*. Never apologise for size. Size is handled by omission and precision, not by claims. "One team
owns scope, design, build, launch, and iteration" is true, and it reframes four people as an advantage.
Never state a headcount, revenue figure, or client count.

Sentences: short. Paragraphs: two to three sentences maximum on the marketing site. Headlines:
declarative. No gerund-stacking. No colon-with-a-cute-subtitle.

---

## Non-negotiables

1. **The word "Strukture" appears nowhere** — code, copy, metadata, README, filenames, or assets.
   Legacy assets are deleted, not left orphaned.
2. **No fabricated testimonials.** The three currently on the site are placeholders attributed to named
   people at named companies. They do not ship. Either the section is cut, or it stays behind
   `TESTIMONIALS_ENABLED = false` with a typed empty array and a comment saying real quotes go here.
3. **No invented metrics, client counts, or logos.**
4. **No stock photography of people, anywhere.** Product screenshots, architecture diagrams, abstract
   system geometry, and the trace motif only.
5. **The EVIM mark is a third-party mark.** It identifies their project inside our own tooling, so it
   belongs in the app and in reports prepared for EVIM. It does **not** go on the public marketing site
   as a client logo without their written permission — that decision belongs to the team, not to us.

---

## The bar

The sums are right, the scoping is airtight, the motion is felt, and a client who opens the PDF assumes
it came from a team much larger than four people.
