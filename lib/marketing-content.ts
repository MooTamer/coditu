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
  imageSrc: string;
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
    work: SectionIntro & { cardLabel: string };
    process: SectionIntro;
    team: SectionIntro;
    testimonials: SectionIntro;
    insights: SectionIntro & { cardLabel: string };
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
    title: "Tailored digital systems, portals, and AI products under one accountable team",
    description:
      "We build all-in-one solutions for companies, teams, and individual operators across Germany and Egypt, from RAG assistants and Microsoft SPFx portals to custom web apps, SEO and performance work, and internal business systems.",
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
      title: "Structured delivery for teams that need software to carry real work",
      description:
        "We partner with operators, founders, enterprise teams, and specialists who need one accountable team to design, build, and refine the right digital system.",
    },
    services: {
      eyebrow: "Services",
      title: "All-in-one solutions shaped around the way your business operates",
      description:
        "From customer-facing platforms to governed internal systems, we combine product thinking, engineering, automation, and optimization under one delivery model.",
    },
    work: {
      eyebrow: "Selected Work",
      title: "Portfolio snapshots with measurable operational and commercial outcomes",
      description:
        "A curated view of portals, assistants, business systems, and growth-focused platforms built for teams that need clarity, speed, and staying power.",
      cardLabel: "Portfolio snapshot",
    },
    process: {
      eyebrow: "Process",
      title: "A delivery rhythm that keeps strategy, build, and iteration aligned",
      description:
        "We keep scope, ownership, and feedback visible from the first brief through launch and long-term optimization.",
    },
    team: {
      eyebrow: "Team",
      title: "A Germany + Egypt team working like one product unit",
      description:
        "Product, design, engineering, AI, and optimization work inside one distributed delivery system with shared standards and clear accountability.",
    },
    testimonials: {
      eyebrow: "Testimonials",
      title: "Chosen by teams that need software to perform beyond launch day",
      description:
        "Our work is measured in adoption, throughput, and business clarity, not just shipping velocity.",
    },
    insights: {
      eyebrow: "Insights",
      title: "Short notes from delivery, architecture, and operational product work",
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
      outcomes: ["Clear ownership", "Less tool sprawl", "Faster decisions"],
      icon: "workflow",
    },
    {
      title: "Enterprise teams needing governed portals",
      description:
        "Design secure Microsoft SPFx components and enterprise portals that match internal standards and constraints.",
      outcomes: ["Governed access", "Portal consistency", "Enterprise-ready delivery"],
      icon: "building",
    },
    {
      title: "Founders and operators packaging expertise",
      description:
        "Turn a service, workflow, or specialist offer into a polished product or internal platform without juggling multiple vendors.",
      outcomes: ["Single delivery team", "Fast validation", "Production-ready execution"],
      icon: "sparkles",
    },
    {
      title: "Teams deploying AI where it has real leverage",
      description:
        "Build RAG assistants and knowledge workflows that reduce search friction and support repetitive high-value tasks.",
      outcomes: ["Grounded answers", "Fewer escalations", "Faster internal support"],
      icon: "brain",
    },
    {
      title: "Growth teams improving acquisition efficiency",
      description:
        "Tighten performance, metadata, and technical SEO so faster experiences translate into better conversion and discoverability.",
      outcomes: ["Stronger Core Web Vitals", "Cleaner metadata", "Better conversion paths"],
      icon: "search",
    },
    {
      title: "Product teams replacing brittle legacy surfaces",
      description:
        "Modernize internal and external web experiences into maintainable systems with room to grow.",
      outcomes: ["Stable architecture", "Better maintainability", "Faster iteration"],
      icon: "layers",
    },
  ],
  services: [
    {
      title: "RAG and AI assistants",
      description:
        "Grounded assistants, knowledge workflows, and operational AI experiences designed around your actual documents, rules, and processes.",
      bullets: ["Knowledge ingestion", "Guardrailed answers", "Workflow integration"],
      icon: "brain",
    },
    {
      title: "Microsoft SPFx and enterprise portals",
      description:
        "Tailored SPFx components, internal portals, and governed enterprise surfaces that fit the systems your teams already rely on.",
      bullets: ["Portal architecture", "Governance-aware delivery", "Internal UX upgrades"],
      icon: "building",
    },
    {
      title: "Custom web apps",
      description:
        "Customer-facing and internal applications designed around the way your business actually operates, not generic templates.",
      bullets: ["Product architecture", "Design systems", "Reliable delivery"],
      icon: "layout",
    },
    {
      title: "Internal business systems",
      description:
        "Operational software for approvals, scheduling, reporting, and multi-step workflows that need structure and visibility.",
      bullets: ["Workflow automation", "Role-based access", "Unified data views"],
      icon: "workflow",
    },
    {
      title: "SEO and performance",
      description:
        "Technical improvements that make fast experiences easier to discover, easier to trust, and more likely to convert.",
      bullets: ["Core Web Vitals", "Structured metadata", "Performance budgets"],
      icon: "search",
    },
    {
      title: "All-in-one delivery",
      description:
        "Strategy, design, engineering, launch support, and ongoing iteration inside one accountable engagement.",
      bullets: ["Single roadmap", "Cross-functional execution", "Long-term partnership"],
      icon: "sparkles",
    },
  ],
  workItems: [
    {
      title: "Atlas Operations Portal",
      summary:
        "A unified internal platform for approvals, tracking, and reporting across a growing operations team.",
      industry: "Operations",
      outcome: "37% faster case handling",
      tags: ["Internal systems", "Automation"],
      capabilities: ["Operations portal", "Approval flows", "Reporting"],
      imageSrc: "/work/work-1.svg",
    },
    {
      title: "Northline Partner Workspace",
      summary:
        "A secure partner-facing workspace that simplified onboarding, document routing, and shared visibility.",
      industry: "Enterprise",
      outcome: "2.4x onboarding throughput",
      tags: ["Enterprise portal", "Partner access"],
      capabilities: ["Document workflows", "Permissions", "Shared dashboards"],
      imageSrc: "/work/work-2.svg",
    },
    {
      title: "Crestline Growth Platform",
      summary:
        "A high-performance marketing platform built to connect editorial control, technical SEO, and conversion-focused page design.",
      industry: "Growth",
      outcome: "51% higher conversion rate",
      tags: ["Web platform", "Performance"],
      capabilities: ["SEO foundation", "Content workflow", "Conversion design"],
      imageSrc: "/work/work-3.svg",
    },
    {
      title: "Meridian Knowledge Assistant",
      summary:
        "A RAG assistant grounded in policy, delivery, and support material for faster internal answers.",
      industry: "Professional services",
      outcome: "64% fewer support escalations",
      tags: ["AI assistant", "Knowledge systems"],
      capabilities: ["Grounded responses", "Internal search", "Knowledge routing"],
      imageSrc: "/work/work-4.svg",
    },
    {
      title: "Helix Dispatch Console",
      summary:
        "A tailored scheduling and dispatch system that gave distributed field teams one operational surface.",
      industry: "Field operations",
      outcome: "29% less idle time",
      tags: ["Business system", "Scheduling"],
      capabilities: ["Dispatch workflows", "Shared schedules", "Operational controls"],
      imageSrc: "/work/work-5.svg",
    },
    {
      title: "Luma Expert Studio",
      summary:
        "A client and delivery workspace for an independent operator packaging services, materials, and repeatable execution into one system.",
      industry: "Independent practice",
      outcome: "3x faster proposal turnaround",
      tags: ["Custom web app", "Client workspace"],
      capabilities: ["Client portal", "Content system", "Delivery automation"],
      imageSrc: "/work/work-6.svg",
    },
  ],
  processSteps: [
    {
      step: "01",
      title: "Discovery and decision framing",
      description:
        "We align on business goals, platform constraints, user needs, and the smallest credible path forward.",
    },
    {
      step: "02",
      title: "Product and system design",
      description:
        "We define information flow, interfaces, content structure, and implementation boundaries before build pressure sets in.",
    },
    {
      step: "03",
      title: "Build and integrate",
      description:
        "Cross-functional delivery moves in visible increments with clear ownership and regular review points.",
    },
    {
      step: "04",
      title: "Launch and stabilize",
      description:
        "We release with attention to adoption, quality, performance, and the operational details that matter after go-live.",
    },
    {
      step: "05",
      title: "Iterate with intent",
      description:
        "We extend the system, reduce friction, and keep the product aligned with changing business needs.",
    },
  ],
  team: {
    summaryEyebrow: "Distributed by design",
    summaryTitle: "Shared delivery across Germany and Egypt",
    summaryDescription:
      "Daily overlap, common standards, and accountable handoffs keep strategy and execution connected across both hubs.",
    regions: [
      { label: "Germany", className: "left-[34%] top-[30%]", delay: 0.16 },
      { label: "Egypt", className: "left-[55%] top-[48%]", delay: 0.24 },
    ],
    members: [
      {
        name: "Maya Schneider",
        role: "Product Strategy",
        location: "Berlin, Germany",
        initials: "MS",
        specialties: ["Discovery", "Roadmapping"],
      },
      {
        name: "Felix Braun",
        role: "Performance and SEO",
        location: "Munich, Germany",
        initials: "FB",
        specialties: ["Core Web Vitals", "Technical SEO"],
      },
      {
        name: "Omar Tarek",
        role: "Engineering Lead",
        location: "Cairo, Egypt",
        initials: "OT",
        specialties: ["Architecture", "Business systems"],
      },
      {
        name: "Leila Hassan",
        role: "AI Solutions",
        location: "Alexandria, Egypt",
        initials: "LH",
        specialties: ["RAG systems", "Prompt design"],
      },
    ],
  },
  testimonials: [
    {
      quote:
        "Strukture Digital gave us one team that could shape the roadmap, ship the system, and keep improving it after launch.",
      author: "Nadia Elmasry",
      role: "COO",
      company: "Northline Group",
    },
    {
      quote:
        "They translated a messy operational workflow into software our team actually wants to use every day.",
      author: "Martin Keller",
      role: "Head of Operations",
      company: "Helix Industrial",
    },
    {
      quote:
        "The quality stayed high across strategy, interface work, engineering, and performance tuning. It felt like one joined-up delivery system.",
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
    title: "Need one team to structure the next phase of your product or system?",
    description:
      "We design, build, and refine tailored digital systems with distributed delivery across Germany and Egypt.",
    email: "hello@strukturedigital.com",
    emailCtaLabel: "Email the team",
    contactLines: ["Germany + Egypt", "Remote-first delivery", "Strategy, build, and iteration"],
    copyright: "Built for teams that need tailored software to do real work.",
  },
};
