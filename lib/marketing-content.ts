/**
 * Every word on the marketing site.
 *
 * Copy lives here rather than inside components so a claim can be checked in
 * one place. Two rules the brief makes non-negotiable, and both are easier to
 * hold when the text is a data structure:
 *
 *   - Nothing here may be invented. No testimonials, no metrics, no client
 *     counts, no logos we were not given. `testimonials` is a typed empty array
 *     behind a disabled flag rather than a deleted concept, so the next person
 *     to reach for one finds the reason instead of a blank file.
 *   - The team is four people in Munich, Ulm, and Cairo. There is nobody in
 *     Berlin, and the site must not imply a bigger company than the one that
 *     would show up to the call.
 *
 * Source: `design/project/Coditu Site.dc.html` and `docs/00-CONTEXT.md`.
 */

export interface NavItem {
  label: string;
  href: `#${string}`;
}

export interface WorkImage {
  src: string;
  alt: string;
}

export interface WorkItem {
  id: string;
  client: string;
  industry: string;
  title: string;
  summary: string;
  stack: string[];
  images: WorkImage[];
  problem: string;
  solution: string;
  impact: string;
  /** How many grid columns the card claims on a wide viewport. */
  wide: boolean;
}

export interface ServiceItem {
  n: string;
  title: string;
  bullets: string[];
}

export interface UseCase {
  title: string;
  body: string;
  outcome: string;
}

export interface ProcessStep {
  n: string;
  title: string;
  body: string;
}

export interface TeamMember {
  name: string;
  role: string;
  base: string;
  initials: string;
  specialties: string[];
}

export interface DeliveryNote {
  topic: string;
  read: string;
  title: string;
  excerpt: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
}

/**
 * The three testimonials in the pre-Coditu site were placeholders attributed to
 * named people at named companies who never said them. They are not coming
 * back until somebody real says something real and agrees to be quoted.
 */
export const TESTIMONIALS_ENABLED = false;
export const testimonials: readonly Testimonial[] = [];

const SITE_URL = "https://coditu.com";
const CONTACT_EMAIL = "hello@coditu.com";

export const nav: readonly NavItem[] = [
  { label: "Work", href: "#work" },
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "Team", href: "#team" },
  { label: "Contact", href: "#contact" },
];

export const hero = {
  eyebrow: "Coditu",
  region: "Germany + Egypt",
  /** Split for the per-word entrance; joined for anything that needs the string. */
  headline: [
    "We",
    "build",
    "portals,",
    "internal",
    "systems,",
    "and",
    "RAG",
    "assistants.",
  ],
  lede: "One team owns scope, design, build, launch, and iteration. Four engineers, two hubs, no subcontracting.",
  points: [
    "SPFx components inside existing SharePoint governance",
    "Approvals, scheduling, and reporting with role-based access",
    "RAG assistants with ingestion, indexing, and answer guardrails",
  ],
  /** Parallax factor per tile — the design's `data-px`. */
  tiles: [
    { label: "SPFx Portals", left: "4%", top: "62%", depth: 0.5 },
    { label: "RAG", left: "22%", top: "8%", depth: 0.8 },
    { label: "Web Apps", left: "45%", top: "30%", depth: 0.35 },
    { label: "Systems", left: "56%", top: "78%", depth: 0.62 },
  ],
  locations: ["Cairo", "Munich", "Ulm"],
} as const;

export const work: readonly WorkItem[] = [
  {
    id: "evim",
    client: "EVIM · Germany",
    industry: "Enterprise",
    title: "MEINEvim internal SharePoint components",
    summary:
      "A reusable SPFx component set — banner, news, link tiles, tabs, org chart — replacing fragmented legacy widgets across the intranet.",
    stack: ["SPFx", "React", "TypeScript", "SharePoint Online"],
    images: [
      {
        src: "/work/banner-and-news.webp",
        alt: "MEINEvim banner and news web parts in the modern SharePoint UI",
      },
      { src: "/work/org-chart.webp", alt: "MEINEvim org chart web part" },
    ],
    problem:
      "Internal teams ran on fragmented legacy web parts. One change meant editing the same widget in four places, and nobody owned the baseline.",
    solution:
      "One reusable SPFx component set, built to EVIM's existing governance and permission model, with editor-facing settings on every web part.",
    impact:
      "Editors maintain the intranet themselves inside the modern UI, against one component baseline instead of four copies.",
    wide: true,
  },
  {
    id: "nile",
    client: "Nile Atelier · Egypt",
    industry: "Clothing manufacturing",
    title: "Nile Atelier partner portal",
    summary:
      "Partner onboarding, document routing, and shared visibility for a manufacturer working with distributed suppliers.",
    stack: ["Next.js", "TypeScript", "Secure file workflows"],
    images: [{ src: "/work/nile-atelier.webp", alt: "Nile Atelier partner portal interface" }],
    problem:
      "Supplier onboarding and document handoffs ran over email. Neither side could say where a file was without asking.",
    solution:
      "A portal that holds onboarding steps, routes documents to the right reviewer, and shows both sides the same state.",
    impact:
      "Handoffs stopped getting lost in threads, and onboarding progress is readable without a status call.",
    wide: false,
  },
  {
    id: "ops",
    client: "Ops Console",
    industry: "DevOps / infrastructure",
    title: "Unified infrastructure dashboard",
    summary:
      "A single Vue 3 dashboard over Redis, Pinecone, S3, PostgreSQL, and the AI services, with controls next to the telemetry.",
    stack: ["Vue 3", "TypeScript", "Redis", "PostgreSQL", "Pinecone", "S3"],
    images: [
      { src: "/work/converso.webp", alt: "Ops Console dashboard showing infrastructure service panels" },
    ],
    problem:
      "Operational signals lived in five separate consoles, so incident response started with a scavenger hunt across tabs.",
    solution:
      "One dashboard that aggregates service telemetry and puts the relevant control next to the reading it belongs to.",
    impact:
      "Cross-service state is readable in one screen, and debugging starts with data instead of tab-switching.",
    wide: false,
  },
  {
    id: "nvrmiss",
    client: "NVRMiss",
    industry: "B2B SaaS · field services",
    title: "AI receptionist product landing",
    summary:
      "Positioning, pricing, and a three-step onboarding flow for a 24/7 receptionist that qualifies leads and books jobs.",
    stack: ["Next.js", "TypeScript", "Motion design", "Pricing & FAQ"],
    images: [
      {
        src: "/work/NVRMiss.webp",
        alt: "NVRMiss landing page showing call handling and booking dashboard",
      },
    ],
    problem:
      "Service businesses miss after-hours calls and lose the job to whoever answers first.",
    solution:
      "A landing page that sells one thing clearly: lead qualification, booking, call logs, and calendar sync, with onboarding in three steps.",
    impact: "A demo path that reads the same to HVAC, plumbing, roofing, and cleaning operators.",
    wide: true,
  },
];

export const services: readonly ServiceItem[] = [
  {
    n: "01",
    title: "Enterprise portals",
    bullets: [
      "SPFx architecture and component sets",
      "Permission and governance models",
      "SharePoint Online UX upgrades",
    ],
  },
  {
    n: "02",
    title: "Internal business systems",
    bullets: ["Approval and scheduling flows", "Role-based access", "Operational dashboards"],
  },
  {
    n: "03",
    title: "AI assistants using RAG",
    bullets: ["Ingestion and indexing", "Answer guardrails", "Workflow actions"],
  },
  {
    n: "04",
    title: "Web applications",
    bullets: ["Product and system architecture", "Interface systems", "Release management"],
  },
  {
    n: "05",
    title: "Performance and technical SEO",
    bullets: ["Core Web Vitals", "Metadata structure", "Performance budgets"],
  },
  {
    n: "06",
    title: "End-to-end delivery",
    bullets: ["Scope and estimates", "Weekly increments", "Post-launch iteration"],
  },
];

export const process: readonly ProcessStep[] = [
  {
    n: "01",
    title: "Discovery and framing",
    body: "Goals, constraints, users, and the most sensible place to start. We name what is out of scope in writing.",
  },
  {
    n: "02",
    title: "System and interface design",
    body: "The flow, the interface structure, and the implementation boundaries, decided before the build starts.",
  },
  {
    n: "03",
    title: "Build in visible increments",
    body: "Weekly increments with one owner per piece. Sprint state is public to everyone on the engagement.",
  },
  {
    n: "04",
    title: "Launch and stabilise",
    body: "Careful cutover, then the fixes and operational details that only appear in real use.",
  },
  {
    n: "05",
    title: "Iterate with intent",
    body: "Changes driven by usage and the next business need, not by a backlog that grew on its own.",
  },
];

export const useCases: readonly UseCase[] = [
  {
    title: "Operations leaders",
    body: "Replace manual steps with workflows and reporting that hold up in an audit.",
    outcome: "Fewer handoffs to chase",
  },
  {
    title: "Enterprise teams",
    body: "Portals that fit inside existing Microsoft governance instead of working around it.",
    outcome: "Governed access",
  },
  {
    title: "Founders and specialists",
    body: "Turn a service into software without managing three vendors to do it.",
    outcome: "One delivery team",
  },
  {
    title: "Teams adopting AI",
    body: "RAG assistants for support, internal search, and the tasks people repeat daily.",
    outcome: "Grounded answers",
  },
  {
    title: "Growth teams",
    body: "Speed, metadata structure, and technical SEO tied to what converts.",
    outcome: "Core Web Vitals in budget",
  },
  {
    title: "Product teams",
    body: "Replace fragile legacy surfaces with a maintainable web application.",
    outcome: "Releases without drama",
  },
];

export const team: readonly TeamMember[] = [
  {
    name: "Mohamed Tamer",
    role: "Frontend Lead",
    base: "Cairo, EG",
    initials: "MT",
    specialties: ["UI/UX & interaction", "Motion", "Design systems", "Frontend architecture"],
  },
  {
    name: "Adam Nafie",
    role: "Client Partnerships Lead",
    base: "Munich, DE",
    initials: "AN",
    specialties: ["Discovery", "Solution design", "Roadmapping", "Hands-on QA"],
  },
  {
    name: "Abdelrahman Elkhateeb",
    role: "Frontend Engineer",
    base: "Cairo, EG",
    initials: "AE",
    specialties: ["Core Web Vitals", "Technical SEO", "Scalable UI"],
  },
  {
    name: "Ahmed Yehia",
    role: "Backend & DevOps",
    base: "Ulm, DE",
    initials: "AY",
    specialties: ["APIs", "CI/CD", "Databases & infra", "RAG pipelines"],
  },
];

/**
 * Positions, not articles. There is no blog behind these, so they render as
 * plain cards — a link promising a page we have not written is the same
 * category of lie as an invented testimonial, just quieter.
 */
export const deliveryNotes: readonly DeliveryNote[] = [
  {
    topic: "Systems design",
    read: "6 min",
    title: "Designing internal systems people adopt without training fatigue",
    excerpt:
      "Practical ways to cut friction so operational software is trusted from the first week.",
  },
  {
    topic: "AI delivery",
    read: "7 min",
    title: "Where RAG assistants create value first",
    excerpt:
      "Choosing the knowledge workflow to ground before AI becomes a platform initiative.",
  },
  {
    topic: "Performance",
    read: "5 min",
    title: "Performance work becomes strategic when it changes the economics",
    excerpt:
      "Speed and technical SEO matter most when they are tied to discoverability and conversion.",
  },
];

export const faq: readonly FaqItem[] = [
  {
    question: "What does an end-to-end engagement include?",
    answer:
      "Discovery, design, engineering, launch, and the iteration after it. The same four people are on it the whole way.",
  },
  {
    question: "Do you only work with enterprise teams?",
    answer:
      "No. We work with startups and enterprise teams when the problem is defined well enough to scope.",
  },
  {
    question: "Can you work inside existing enterprise constraints?",
    answer:
      "Yes. Governance, permission models, and platform standards are the starting conditions, not an obstacle to route around.",
  },
  {
    question: "Do you handle modernisation as well as new builds?",
    answer:
      "Both. Phased modernisation usually means running the old and new surface side by side for a while, and we plan for that.",
  },
  {
    question: "How does the distributed setup work?",
    answer:
      "Munich and Ulm cover the client day, Cairo carries the build, and the overlap hours are where handoffs happen live.",
  },
];

export const contact = {
  heading: "Tell us what needs building.",
  body: "Send the constraint you are stuck on — the platform, the deadline, the governance rule. You get an answer from the person who would build it.",
  email: CONTACT_EMAIL,
  locations: "Munich · Ulm · Cairo",
  offer: "Scope, build, and iteration",
  navigate: [
    { label: "Work", href: "#work" },
    { label: "Services", href: "#services" },
    { label: "Process", href: "#process" },
    { label: "Use cases", href: "#use-cases" },
    { label: "Team", href: "#team" },
    { label: "Notes", href: "#insights" },
    { label: "FAQ", href: "#faq" },
  ] satisfies NavItem[],
  colophon: "© 2026 Coditu · Software for teams that need reliable execution.",
} as const;

export const siteMeta = {
  siteName: "Coditu",
  siteUrl: SITE_URL,
  email: CONTACT_EMAIL,
  defaultTitle: "Coditu — Portals, internal systems, and RAG assistants",
  pageTitle: "Portals, internal systems, and RAG assistants",
  titleTemplate: "%s | Coditu",
  description:
    "Coditu is a four-person delivery team across Munich, Ulm, and Cairo. We build enterprise portals, internal business systems, and RAG assistants end to end — scope, design, build, launch, and iteration.",
  ogTitle: "Coditu — Portals, internal systems, and RAG assistants",
  ogDescription:
    "One team owns scope, design, build, launch, and iteration. Four engineers, two hubs, no subcontracting.",
  ogImage: "/og.png",
  ogImageSquare: "/og-square.jpg",
  foundingLocations: ["Munich", "Ulm", "Cairo"],
} as const;

/** Kept so `lib/site-url.ts` and the metadata callers have one import. */
export const marketingContent = {
  nav,
  hero,
  work,
  services,
  process,
  useCases,
  team,
  deliveryNotes,
  faq,
  contact,
  siteMeta,
  testimonials,
} as const;
