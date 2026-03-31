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
  title: string;
  summary: string;
  industry: string;
  outcome: string;
  tags: string[];
  capabilities: string[];
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
    defaultTitle: "Strukture Digital | Tailored all-in-one software delivery",
    pageTitle: "Distributed software house for AI, portals, and web systems",
    description:
      "Strukture Digital is a distributed software house across Germany and Egypt delivering tailored, all-in-one solutions including RAG assistants, Microsoft SPFx portals, custom web apps, SEO and performance work, and internal business systems.",
    ogTitle: "Strukture Digital | Germany + Egypt software delivery",
    ogDescription:
      "Tailored all-in-one solutions for AI assistants, Microsoft SPFx portals, web apps, performance, and internal systems.",
    ogImage: "/og.png",
  },
  navItems: [
    { label: "Work", href: "#work" },
    { label: "Services", href: "#services" },
    { label: "Process", href: "#process" },
    { label: "Team", href: "#team" },
    { label: "Insights", href: "#insights" },
    { label: "Contact", href: "#contact" },
  ],
  hero: {
    eyebrow: "Distributed software house",
    title:
      "Digital systems, portals, and AI tools built end to end by one team",
    description:
      "We build tailored software for internal operations, customer portals, and AI-assisted workflows across Germany and Egypt. That includes RAG assistants, Microsoft SPFx portals, custom web apps, performance work, and internal business systems.",
    primaryCtaLabel: "See selected work",
    primaryCtaHref: "#work",
    secondaryCtaLabel: "Start a conversation",
    secondaryCtaHref: "#contact",
    footnote: "Germany + Egypt delivery",
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
      eyebrow: "Who We Build For",
      title: "Software for teams that need their tools to support real work",
      description:
        "We work with operators, founders, enterprise teams, and specialists who need a clear partner to design, build, and improve the right system.",
    },
    services: {
      eyebrow: "Services",
      title: "Practical software work shaped around how your business runs",
      description:
        "From internal tools to customer-facing platforms, we handle design, engineering, automation, and optimization in one delivery flow.",
    },
    work: {
      eyebrow: "Selected Work",
      title: "Recent work across portals, business systems, and product builds",
      description:
        "A selection of systems and platforms built for teams that needed clearer workflows, better performance, or a more useful product surface.",
    },
    process: {
      eyebrow: "Process",
      title: "A straightforward process from brief to follow-up work",
      description:
        "We keep scope, decisions, and feedback visible from the first conversation through launch and later improvements.",
    },
    team: {
      eyebrow: "Team",
      title: "A Germany + Egypt team working like one product team",
      description:
        "We work across product, design, engineering, AI, and performance with shared context and direct handoffs.",
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "Feedback from teams we have built with",
      description:
        "A few notes on how the work felt in practice, from planning through rollout and follow-up.",
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
      title: "Answers before the project starts",
      description:
        "Common questions about fit, delivery structure, platform constraints, and how we scope all-in-one engagements.",
    },
  },
  useCases: [
    {
      title: "Leadership teams modernizing core operations",
      description:
        "Replace fragmented manual work with software that supports approvals, reporting, and day-to-day execution.",
      outcomes: ["Clearer ownership", "Less tool sprawl", "Quicker decisions"],
      icon: "workflow",
    },
    {
      title: "Enterprise teams needing governed portals",
      description:
        "Build secure Microsoft SPFx components and enterprise portals that fit internal standards and constraints.",
      outcomes: [
        "Governed access",
        "Consistent portal experience",
        "Delivery that fits enterprise requirements",
      ],
      icon: "building",
    },
    {
      title: "Founders and operators packaging expertise",
      description:
        "Turn a service, workflow, or specialist offer into a product or internal platform without coordinating multiple vendors.",
      outcomes: [
        "One delivery team",
        "Earlier validation",
        "A solid production base",
      ],
      icon: "sparkles",
    },
    {
      title: "Teams deploying AI where it has real leverage",
      description:
        "Build RAG assistants and knowledge workflows that reduce time spent searching and support repeatable internal tasks.",
      outcomes: [
        "More reliable answers",
        "Fewer handoffs",
        "Faster internal support",
      ],
      icon: "brain",
    },
    {
      title: "Growth teams improving acquisition efficiency",
      description:
        "Improve performance, metadata, and technical SEO so the site is easier to find and easier to use.",
      outcomes: [
        "Better Core Web Vitals",
        "Clearer metadata",
        "Stronger conversion paths",
      ],
      icon: "search",
    },
    {
      title: "Product teams replacing brittle legacy surfaces",
      description:
        "Modernize internal and external web experiences into maintainable systems that can keep evolving.",
      outcomes: [
        "More stable architecture",
        "Easier maintenance",
        "Faster iteration",
      ],
      icon: "layers",
    },
  ],
  services: [
    {
      title: "RAG and AI assistants",
      description:
        "RAG assistants, knowledge workflows, and AI features built around the information your team already uses.",
      bullets: [
        "Knowledge ingestion",
        "Response guardrails",
        "Workflow integration",
      ],
      icon: "brain",
    },
    {
      title: "Microsoft SPFx and enterprise portals",
      description:
        "SPFx components, internal portals, and enterprise interfaces built to fit the systems your teams already work in.",
      bullets: [
        "Portal architecture",
        "Governance-aware delivery",
        "Internal UX upgrades",
      ],
      icon: "building",
    },
    {
      title: "Custom web apps",
      description:
        "Customer-facing and internal web apps built around real workflows instead of generic templates.",
      bullets: [
        "Product architecture",
        "Interface systems",
        "Reliable delivery",
      ],
      icon: "layout",
    },
    {
      title: "Internal business systems",
      description:
        "Operational software for approvals, scheduling, reporting, and multi-step workflows that need structure and visibility.",
      bullets: [
        "Workflow automation",
        "Role-based access",
        "Unified data views",
      ],
      icon: "workflow",
    },
    {
      title: "SEO and performance",
      description:
        "Technical improvements that make sites faster, easier to discover, and easier to use.",
      bullets: [
        "Core Web Vitals",
        "Structured metadata",
        "Performance budgets",
      ],
      icon: "search",
    },
    {
      title: "All-in-one delivery",
      description:
        "Strategy, design, build, launch support, and follow-on improvements with one team throughout.",
      bullets: ["One roadmap", "Shared context", "Ongoing follow-up"],
      icon: "sparkles",
    },
  ],
  workItems: [
    {
      title: "MEINEvim Germany: Internal SharePoint Components",
      summary:
        "A set of reusable SharePoint Online components that helped EVIM's internal teams work more efficiently within the modern UI experience.",
      industry: "Enterprise",
      outcome: "Reusable components aligned with internal workflows",
      tags: ["SPFx", "SharePoint Online", "Internal tools"],
      capabilities: [
        "Custom SPFx web parts",
        "Workflow-aligned design",
        "Internal adoption",
      ],
      images: [
        {
          src: "/work/Banner and News.webp",
          alt: "EVIM SharePoint banner and news module",
          objectPosition: "50% 0%",
        },
        {
          src: "/work/orgChart.png",
          alt: "EVIM SharePoint internal portal banner",
          objectPosition: "50% 0%",
        },
      ],
    },
    {
      title: "Nile Atelier Egypt: Clothing Manufacturer Portal",
      summary:
        "A partner workspace that helped simplify onboarding, document routing, and shared visibility.",
      industry: "Manufacturing",
      outcome: "Streamlined partner onboarding and collaboration",
      tags: ["Custom web app", "Partner portal"],
      capabilities: ["Custom web app development", "Document management"],
      images: [
        {
          src: "/work/NileAtelier.webp",
          alt: "Nile Atelier Egypt: Clothing Manufacturer Portal",
          objectPosition: "50% 0%",
        },
      ],
    },
    {
  title: "Ops Console: Unified Infrastructure Dashboard",
  summary:
    "A single-page operations dashboard that centralizes monitoring and management of Redis, Pinecone, S3, PostgreSQL, and AI services through a modern, real-time interface.",
  industry: "DevOps / Infrastructure / AI Platforms",
  outcome:
    "Improved visibility across multiple services with a unified interface, enabling faster debugging, monitoring, and operational decision-making",
  tags: ["Vue 3", "TypeScript", "DevOps Dashboard", "Monitoring"],
  capabilities: [
    "Multi-service infrastructure monitoring",
    "Real-time telemetry visualization",
    "Secure API key-based access",
    "Scalable modular architecture",
  ],
  images: [
    {
      src: "/work/converso.webp",
      alt: "Ops Console bento-grid infrastructure dashboard",
      objectPosition: "50% 0%",
    }
  ],
},
    {
      title: "NVR Miss: Smart Cat Litter Box Experience",
      summary:
        "A product-focused web application showcasing an ergonomically designed cat litter box that improves cleanliness, reduces waste, and enhances usability for both pets and owners.",
      industry: "E-commerce / Pet Products",
      outcome:
        "Clear product positioning with emphasis on usability, hygiene, and simplified purchasing flow",
      tags: ["Next.js", "Landing page", "Product showcase"],
      capabilities: [
        "Product-centric UI design",
        "User-focused storytelling (problem → solution)",
        "Clean and minimal navigation",
      ],
      images: [
       
        {
          src: "/work/NVRMiss.webp",
          alt: "Product design showcasing high walls and center entrance",
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
    summaryTitle: "Working across Germany and Egypt",
    summaryDescription:
      "Daily overlap, shared context, and clear handoffs keep the work moving across both hubs.",
    regions: [
      { label: "Germany", className: "left-[34%] top-[30%]", delay: 0.16 },
      { label: "Egypt", className: "left-[55%] top-[48%]", delay: 0.24 },
    ],
    members: [
      {
        name: "Mohamed Tamer",
        role: "Software Engineer",
        location: "Cairo, Egypt",
        initials: "MT",
        specialties: [
          "Full-stack development",
          "UI/UX design",
          "Microsoft SPFx",
          "Digital Transformation",
        ],
      },
      {
        name: "Adam Nafie",
        role: "Business Systems Lead",
        location: "Munich, Germany",
        initials: "AN",
        specialties: [
          "Discovery",
          "Roadmapping",
          "Core Web Vitals",
          "Technical SEO",
        ],
      },
      {
        name: "Abdelrahman Elkhateeb",
        role: "Software Engineer",
        location: "Cairo, Egypt",
        initials: "AE",
        specialties: ["Performance", "SEO", "Architecture"],
      },
      {
        name: "Ahmed Yehia",
        role: "Software Engineer",
        location: "Ulm, Germany",
        initials: "AY",
        specialties: [
          "RAG systems",
          "Prompt design",
          "AI features",
          "optimisation",
        ],
      },
    ],
  },
  testimonials: [
    {
      quote:
        "Strukture Digital helped us keep the roadmap, build, and post-launch improvements under one team instead of splitting the work across several parties.",
      author: "Nadia Elmasry",
      role: "COO",
      company: "Northline Group",
    },
    {
      quote:
        "They took a messy operational workflow and turned it into something our team could actually use day to day.",
      author: "Martin Keller",
      role: "Head of Operations",
      company: "Helix Industrial",
    },
    {
      quote:
        "The work stayed consistent across product thinking, interface design, engineering, and performance improvements. That made the project easier to manage.",
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
      question: "What does an all-in-one engagement look like in practice?",
      answer:
        "You work with one accountable team covering discovery, design, engineering, launch support, and ongoing iteration instead of splitting delivery across multiple vendors.",
    },
    {
      question: "Do you only work with larger companies?",
      answer:
        "No. We work with companies, teams, and individual operators when the need is clear and the product or system has real operational value.",
    },
    {
      question: "Can you work inside existing enterprise constraints?",
      answer:
        "Yes. We regularly design around governance, permissions, internal platform standards, and phased modernization needs.",
    },
    {
      question: "Do you handle both new builds and modernization work?",
      answer:
        "Yes. Some engagements start from zero, while others focus on restructuring an existing portal, app, or internal workflow without a disruptive rewrite.",
    },
    {
      question: "How do you work across Germany and Egypt?",
      answer:
        "The team is distributed by design. We keep overlap hours, ownership, and communication rhythms explicit so delivery stays predictable across both hubs.",
    },
  ],
  footer: {
    title: "Need one team to build or improve your next product or system?",
    description:
      "We design, build, and improve tailored digital systems across Germany and Egypt.",
    email: "hello@strukturedigital.com",
    emailCtaLabel: "Email the team",
    contactLines: [
      "Germany + Egypt",
      "Remote-first delivery",
      "Strategy, build, and iteration",
    ],
    copyright: "Built for teams that need tailored software to do real work.",
  },
};
