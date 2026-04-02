export type IconKey =
  | "globe"
  | "sparkles"
  | "layout"
  | "workflow"
  | "search"
  | "brain"
  | "building"
  | "layers";

export interface NavItem {
  label: string;
  href: `#${string}`;
}

export interface SectionIntro {
  eyebrow: string;
  title: string;
  description: string;
}

export interface UseCase {
  title: string;
  description: string;
  outcomes: string[];
  icon: IconKey;
}

export interface ServiceItem {
  title: string;
  description: string;
  bullets: string[];
  icon: IconKey;
}

export interface WorkItem {
  id: string;
  title: string;
  summary: string;
  industry: string;
  outcome: string;
  tags: string[];
  stack: string[];
  highlights: Array<{
    label: string;
    detail: string;
  }>;
  cta?: {
    label: string;
    href: string;
  };
  images: Array<{
    src: string;
    alt: string;
    objectPosition?: string;
  }>;
}

export interface ProcessStep {
  step: string;
  title: string;
  description: string;
}

export interface TeamRegion {
  label: string;
  className: string;
  delay: number;
}

export interface TeamMember {
  name: string;
  role: string;
  location: string;
  initials: string;
  specialties: string[];
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
}

export interface InsightItem {
  title: string;
  excerpt: string;
  topic: string;
  readTime: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface HeroTile {
  id: string;
  label: string;
  positionClass: string;
  variant: "icon" | "avatar";
  icon?: IconKey;
  initials?: string;
  parallaxFactor: number;
  floatDistance: number;
  delay: number;
}

export interface MarketingContent {
  siteMeta: {
    siteName: string;
    siteUrl: string;
    defaultTitle: string;
    pageTitle: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
  };
  navItems: NavItem[];
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    highlights: string[];
    primaryCtaLabel: string;
    primaryCtaHref: `#${string}`;
    secondaryCtaLabel: string;
    secondaryCtaHref: `#${string}`;
    footnote: string;
    tiles: HeroTile[];
  };
  sections: {
    useCases: SectionIntro;
    services: SectionIntro;
    work: SectionIntro & { cardLabel?: string };
    process: SectionIntro;
    team: SectionIntro;
    testimonials: SectionIntro;
    insights: SectionIntro & { cardLabel?: string };
    faq: SectionIntro;
  };
  useCases: UseCase[];
  services: ServiceItem[];
  workItems: WorkItem[];
  processSteps: ProcessStep[];
  team: {
    summaryEyebrow: string;
    summaryTitle: string;
    summaryDescription: string;
    regions: TeamRegion[];
    members: TeamMember[];
  };
  testimonials: Testimonial[];
  insights: InsightItem[];
  faq: FaqItem[];
  footer: {
    title: string;
    description: string;
    email: string;
    emailCtaLabel: string;
    contactLines: string[];
    copyright: string;
  };
}

export const marketingContent: MarketingContent = {
  siteMeta: {
    siteName: "Strukture Digital",
    siteUrl: "https://strukturedigital.com",
    defaultTitle: "Strukture Digital | Portals, systems, and AI workflows",
    pageTitle: "Portals, systems, and AI workflows",
    description:
      "Distributed team across Germany + Egypt building enterprise portals, internal business systems, AI assistants using RAG, and web apps with strong performance and SEO.",
    ogTitle: "Strukture Digital | Portals, systems, and AI workflows",
    ogDescription:
      "Enterprise portals, internal systems, AI/RAG workflows, and high-performance web apps delivered end to end.",
    ogImage: "/og/og-whatsapp.jpg",
  },
  navItems: [
    { label: "Work", href: "#work" },
    { label: "Team", href: "#team" },
    { label: "Use Cases", href: "#use-cases" },
    // { label: "Process", href: "#process" },
    // { label: "Services", href: "#services" },
    // { label: "Insights", href: "#insights" },
    { label: "Contact", href: "#contact" },
  ],
  hero: {
    eyebrow: "Distributed team",
    title: "We build portals, internal systems, and AI workflows.",
    description: "One team handles scope, design, build, launch, and iteration.",
    highlights: [
      "Enterprise portals (Microsoft ecosystem)",
      "AI assistants using RAG",
      "Internal business systems, web apps, performance/SEO",
    ],
    primaryCtaLabel: "View work",
    primaryCtaHref: "#work",
    secondaryCtaLabel: "Request a call",
    secondaryCtaHref: "#contact",
    footnote: "Germany + Egypt",
    tiles: [
      {
        id: "tile-berlin",
        label: "Berlin",
        positionClass: "left-[2%] top-[24%]",
        variant: "avatar",
        initials: "DE",
        parallaxFactor: 0.34,
        floatDistance: 10,
        delay: 0.08,
      },
      {
        id: "tile-cairo",
        label: "Cairo",
        positionClass: "right-[2%] top-[18%]",
        variant: "avatar",
        initials: "EG",
        parallaxFactor: 0.42,
        floatDistance: 14,
        delay: 0.16,
      },
      {
        id: "tile-munich",
        label: "Munich",
        positionClass: "left-[8%] bottom-[6%]",
        variant: "avatar",
        initials: "DE",
        parallaxFactor: 0.4,
        floatDistance: 12,
        delay: 0.24,
      },
      {
        id: "tile-web-apps",
        label: "Web Apps",
        positionClass: "left-[16%] top-[2%]",
        variant: "icon",
        icon: "layers",
        parallaxFactor: 0.38,
        floatDistance: 11,
        delay: 0.2,
      },
      {
        id: "tile-portals",
        label: "SPFx Portals",
        positionClass: "right-[16%] top-[2%]",
        variant: "icon",
        icon: "building",
        parallaxFactor: 0.33,
        floatDistance: 13,
        delay: 0.26,
      },
      {
        id: "tile-rag",
        label: "RAG",
        positionClass: "right-[8%] bottom-[10%]",
        variant: "icon",
        icon: "brain",
        parallaxFactor: 0.46,
        floatDistance: 14,
        delay: 0.32,
      },
      {
        id: "tile-systems",
        label: "Systems",
        positionClass: "left-[25%] bottom-[2%]",
        variant: "icon",
        icon: "workflow",
        parallaxFactor: 0.31,
        floatDistance: 10,
        delay: 0.36,
      },
    ],
  },
  sections: {
    useCases: {
      eyebrow: "Use Cases",
      title: "Who we work with",
      description:
        "Teams that need practical systems with clear business outcomes.",
    },
    services: {
      eyebrow: "Services",
      title: "What we build",
      description:
        "Software delivery from discovery to post-launch iteration.",
    },
    work: {
      eyebrow: "Selected Work",
      title: "Selected work",
      description: "Projects that improved speed, control, or conversion.",
      cardLabel: "View work",
    },
    process: {
      eyebrow: "Process",
      title: "How we work",
      description:
        "Clear scope, visible progress, and reliable handoffs from start to launch.",
    },
    team: {
      eyebrow: "Team",
      title: "Team",
      description:
        "Product, engineering, and AI delivery with shared ownership.",
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "Client feedback",
      description: "How teams describe the delivery experience and outcomes.",
    },
    insights: {
      eyebrow: "Insights",
      title:
        "Short notes from delivery, architecture, and operational product work",
      description:
        "Practical thinking from the kinds of systems we build every week across AI, portals, performance, and internal operations.",
      cardLabel: "Delivery note",
    },
    faq: {
      eyebrow: "FAQ",
      title: "Common questions",
      description: "Short answers on fit, delivery model, and project setup.",
    },
  },
  useCases: [
    {
      title: "Operations leaders",
      description: "Replace manual steps with clear workflows and reporting.",
      outcomes: ["Faster decisions", "Less rework"],
      icon: "workflow",
    },
    {
      title: "Enterprise teams",
      description: "Build governed Microsoft portals that fit internal standards.",
      outcomes: ["Governed access", "Consistent portal UX"],
      icon: "building",
    },
    {
      title: "Founders and specialists",
      description: "Turn services into software products without managing multiple vendors.",
      outcomes: ["Single delivery team", "Faster validation"],
      icon: "sparkles",
    },
    {
      title: "Teams adopting AI",
      description: "Deploy RAG assistants for support, search, and internal tasks.",
      outcomes: ["Faster answers", "Lower support load"],
      icon: "brain",
    },
    {
      title: "Growth teams",
      description: "Improve speed, metadata, and SEO to raise qualified traffic.",
      outcomes: ["Better Core Web Vitals", "Higher conversion"],
      icon: "search",
    },
    {
      title: "Product teams",
      description: "Replace fragile legacy surfaces with maintainable web applications.",
      outcomes: ["Stable architecture", "Faster releases"],
      icon: "layers",
    },
  ],
  services: [
    {
      title: "AI assistants (RAG)",
      description:
        "Assistants grounded in company knowledge and operational workflows.",
      bullets: ["Ingestion & indexing", "Answer guardrails", "Workflow actions"],
      icon: "brain",
    },
    {
      title: "Enterprise portals",
      description:
        "Microsoft ecosystem portals and components aligned with governance.",
      bullets: ["SPFx architecture", "Permission models", "SharePoint UX upgrades"],
      icon: "building",
    },
    {
      title: "Web applications",
      description:
        "Custom web apps for staff, customers, and partners.",
      bullets: ["Product architecture", "Interface systems", "Release management"],
      icon: "layout",
    },
    {
      title: "Internal business systems",
      description:
        "Operational software for approvals, scheduling, reporting, and execution.",
      bullets: ["Workflow automation", "Role-based access", "Unified dashboards"],
      icon: "workflow",
    },
    {
      title: "Performance and SEO",
      description:
        "Speed and technical SEO improvements tied to business outcomes.",
      bullets: ["Core Web Vitals", "Metadata structure", "Performance budgets"],
      icon: "search",
    },
    {
      title: "End-to-end delivery",
      description:
        "Discovery, design, build, launch, and follow-up in one flow.",
      bullets: ["Clear scope", "Weekly delivery", "Post-launch iteration"],
      icon: "sparkles",
    },
  ],
  workItems: [
    {
      id: "meinevim-sharepoint-components",
      title: "MEINEvim Germany: Internal SharePoint Components",
      summary:
        "A set of reusable SharePoint Online components that helped EVIM's internal teams work more efficiently within the modern UI experience.",
      industry: "Enterprise",
      outcome: "Reusable components aligned with internal workflows",
      tags: ["SPFx", "SharePoint Online", "Internal tools"],
      stack: ["SPFx", "React", "TypeScript", "SharePoint Online"],
      highlights: [
        {
          label: "Problem",
          detail:
            "Internal teams relied on fragmented legacy widgets and duplicated updates.",
        },
        {
          label: "Solution",
          detail:
            "A reusable SPFx component set designed around EVIM's daily workflows and approvals.",
        },
        {
          label: "Impact",
          detail:
            "Teams moved to one maintainable component baseline with higher internal adoption.",
        },
      ],
      cta: {
        label: "Request a call",
        href: "#contact",
      },
      images: [
        {
          src: "/work/banner-and-news.webp",
          alt: "EVIM SharePoint banner and news module",
          objectPosition: "50% 0%",
        },
        {
          src: "/work/org-chart.webp",
          alt: "EVIM SharePoint internal portal banner",
          objectPosition: "50% 0%",
        },
      ],
    },
    {
      id: "nile-atelier-partner-portal",
      title: "Nile Atelier Egypt: Clothing Manufacturer Portal",
      summary:
        "A partner workspace that helped simplify onboarding, document routing, and shared visibility.",
      industry: "Manufacturing",
      outcome: "Streamlined partner onboarding and collaboration",
      tags: ["Custom web app", "Partner portal"],
      stack: ["Next.js", "TypeScript", "Secure file workflows"],
      highlights: [
        {
          label: "Problem",
          detail:
            "Supplier onboarding and document handoffs were slow and inconsistent across channels.",
        },
        {
          label: "Solution",
          detail:
            "A centralized portal for onboarding, routing documents, and tracking collaboration states.",
        },
        {
          label: "Impact",
          detail:
            "Onboarding and handoff cycles became clearer, faster, and easier to track.",
        },
      ],
      images: [
        {
          src: "/work/nile-atelier.webp",
          alt: "Nile Atelier Egypt: Clothing Manufacturer Portal",
          objectPosition: "50% 0%",
        },
      ],
    },
    {
      id: "ops-console-dashboard",
      title: "Ops Console: Unified Infrastructure Dashboard",
      summary:
        "A single-page operations dashboard that centralizes monitoring and management of Redis, Pinecone, S3, PostgreSQL, and AI services through a modern, real-time interface.",
      industry: "DevOps / Infrastructure ",
      outcome:
        "Improved visibility across multiple services with a unified interface",
      tags: ["Vue 3", "TypeScript", "DevOps Dashboard", "Monitoring"],
      stack: ["Vue 3", "TypeScript", "Redis", "PostgreSQL", "Pinecone", "S3"],
      highlights: [
        {
          label: "Problem",
          detail:
            "Critical ops signals lived in separate tools, slowing incident response.",
        },
        {
          label: "Solution",
          detail:
            "A modular dashboard that aggregates telemetry and controls for core infrastructure services.",
        },
        {
          label: "Impact",
          detail:
            "Faster debugging and clearer cross-service visibility for day-to-day operations.",
        },
      ],
      cta: {
        label: "Request a call",
        href: "#contact",
      },
      images: [
        {
          src: "/work/converso.webp",
          alt: "Ops Console bento-grid infrastructure dashboard",
          objectPosition: "50% 0%",
        },
      ],
    },
    {
      id: "nvrmiss-ai-receptionist-landing",
      title: "NVRMiss: AI Receptionist for Service Professionals",
      summary:
        "A product landing experience for a 24/7 AI receptionist that answers calls, qualifies leads, and books jobs automatically—helping service businesses stop losing work after hours.",
      industry: "B2B SaaS / Field Services",
      outcome: "Clear positioning + smoother demo conversion flow",
      tags: [
        "Next.js",
        "Landing page",
        "SaaS",
        "AI receptionist",
        "Conversion-focused",
      ],
      stack: [
        "Next.js",
        "TypeScript",
        "Motion design",
        "Product storytelling",
        "Pricing & FAQ sections",
      ],
      highlights: [
        {
          label: "Problem",
          detail:
            "Service businesses miss calls after hours, losing qualified jobs and wasting time on unstructured lead intake.",
        },
        {
          label: "Solution",
          detail:
            "A focused landing that sells a 24/7 AI receptionist with lead qualification, smart booking, call logs/analytics, and calendar sync (Google/Outlook), plus a simple 3-step onboarding flow.",
        },
        {
          label: "Impact",
          detail:
            "Stronger conversion path to beta/demo and clearer value communication for HVAC, plumbing, roofing, contractors, and cleaning services.",
        },
      ],
      images: [
        {
          // Your local asset path is fine to keep here (site scanning won’t reveal your repo asset paths).
          src: "/work/NVRMiss.webp",
          alt: "NVRMiss landing preview showing product value proposition and booking/call dashboard visuals",
          objectPosition: "50% 0%",
        },
      ],
    },
  ],
  processSteps: [
    {
      step: "01",
      title: "Discovery and decision framing",
      description:
        "We align on goals, constraints, users, and the most sensible place to start.",
    },
    {
      step: "02",
      title: "Product and system design",
      description:
        "We map the flow, interface structure, and implementation boundaries before build starts.",
    },
    {
      step: "03",
      title: "Build and integrate",
      description:
        "We build in small, visible increments with clear ownership and regular review.",
    },
    {
      step: "04",
      title: "Launch and stabilize",
      description:
        "We launch carefully, then handle fixes, polish, and the operational details that show up in real use.",
    },
    {
      step: "05",
      title: "Iterate with intent",
      description:
        "We improve the system based on feedback, usage, and what the business needs next.",
    },
  ],
  team: {
    summaryEyebrow: "Distributed by design",
    summaryTitle: "One team, two hubs",
    summaryDescription:
      "Daily overlap and direct handoffs keep delivery predictable.",
    regions: [
      { label: "Germany", className: "left-[34%] top-[30%]", delay: 0.16 },
      { label: "Egypt", className: "left-[55%] top-[48%]", delay: 0.24 },
    ],
   members: [
  {
    name: "Mohamed Tamer",
    role: "Frontend Lead",
    location: "Cairo, Egypt",
    initials: "MT",
    specialties: [
      "UI/UX & interaction design",
      "Motion & micro-animations",
      "Design systems (shadcn/Tailwind)",
      "Frontend architecture",
    ],
  },
  {
    name: "Adam Nafie",
    role: "Client Partnerships Lead",
    location: "Munich, Germany",
    initials: "AN",
    specialties: [
      "Client discovery & requirements",
      "Solution design & roadmapping",
      "Relationship management",
      "Hands-on QA & release testing",
    ],
  },
  {
    name: "Abdelrahman Elkhateeb",
    role: "Frontend Engineer, Performance & SEO",
    location: "Cairo, Egypt",
    initials: "AE",
    specialties: [
      "Web performance (Core Web Vitals)",
      "Technical SEO",
      "Frontend optimization",
      "Scalable UI architecture",
    ],
  },
  {
    name: "Ahmed Yehia",
    role: "Backend & DevOps Engineer",
    location: "Ulm, Germany",
    initials: "AY",
    specialties: [
      "Backend systems & APIs",
      "DevOps & CI/CD",
      "Databases & infrastructure",
      "RAG pipelines & AI features",
    ],
  },
],
  },
  testimonials: [
    {
      quote:
        "They handled roadmap, build, and post-launch work as one accountable team.",
      author: "Nadia Elmasry",
      role: "COO",
      company: "Northline Group",
    },
    {
      quote:
        "They turned a messy workflow into a system people actually use.",
      author: "Martin Keller",
      role: "Head of Operations",
      company: "Helix Industrial",
    },
    {
      quote:
        "Product, design, engineering, and performance stayed aligned end to end.",
      author: "Samantha Reed",
      role: "VP Digital",
      company: "Crestline Commerce",
    },
  ],
  insights: [
    {
      title: "Designing internal systems people adopt without training fatigue",
      excerpt:
        "A few practical ways to reduce friction and make operational software easier to trust from day one.",
      topic: "Systems Design",
      readTime: "6 min read",
    },
    {
      title: "Where RAG assistants create immediate value for delivery teams",
      excerpt:
        "How to choose the right knowledge workflows before turning AI into a broad platform initiative.",
      topic: "AI Delivery",
      readTime: "7 min read",
    },
    {
      title: "Performance work becomes strategic when it changes the economics",
      excerpt:
        "Why technical SEO and speed matter most when they are tied directly to discoverability, conversion, and trust.",
      topic: "Performance",
      readTime: "5 min read",
    },
  ],
  faq: [
    {
      question: "What does an end-to-end engagement include?",
      answer:
        "One team handles discovery, design, engineering, launch, and follow-up iteration.",
    },
    {
      question: "Do you only work with larger companies?",
      answer:
        "No. We work with startups and enterprise teams when the problem is clear.",
    },
    {
      question: "Can you work inside existing enterprise constraints?",
      answer:
        "Yes. We build within governance, permissions, and existing platform standards.",
    },
    {
      question: "Do you handle both new builds and modernization work?",
      answer:
        "Yes. We handle both new builds and phased modernization work.",
    },
    {
      question: "How does the distributed setup work?",
      answer:
        "Shared overlap hours, clear ownership, and direct handoffs keep delivery predictable.",
    },
  ],
  footer: {
    title: "Need a team to build or improve a digital product?",
    description:
      "We deliver portals, internal systems, and AI workflows end to end.",
    email: "hello@strukturedigital.com",
    emailCtaLabel: "Request a call",
    contactLines: [
      "Distributed delivery",
      "Scope, build, and iteration",
    ],
    copyright: "Software for teams that need reliable execution.",
  },
};
