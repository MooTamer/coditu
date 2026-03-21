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

export const navItems: NavItem[] = [
  { label: "Work", href: "#work" },
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "Team", href: "#team" },
  { label: "Insights", href: "#insights" },
  { label: "Contact", href: "#contact" },
];

export interface UseCase {
  title: string;
  description: string;
  outcomes: string[];
  icon: IconKey;
}

export const useCases: UseCase[] = [
  {
    title: "Founders launching fast",
    description: "Turn early ideas into polished products without stitching multiple vendors.",
    outcomes: ["MVP in weeks", "Single product squad", "Clear roadmap"],
    icon: "sparkles",
  },
  {
    title: "Operations teams scaling",
    description: "Streamline internal workflows, approvals, and reporting in one digital layer.",
    outcomes: ["Fewer manual steps", "Live dashboards", "Process consistency"],
    icon: "workflow",
  },
  {
    title: "Enterprise departments",
    description: "Build secure portals and Microsoft web parts aligned with internal standards.",
    outcomes: ["Governed access", "Department portals", "Audit-friendly structure"],
    icon: "building",
  },
  {
    title: "Product and tech leads",
    description: "Modernize legacy surfaces into maintainable, high-performance web apps.",
    outcomes: ["Faster delivery", "Stable architecture", "Lower maintenance risk"],
    icon: "layers",
  },
  {
    title: "Marketing and growth teams",
    description: "Connect content, SEO, and performance so acquisition improves quarter over quarter.",
    outcomes: ["Technical SEO", "Faster pages", "Higher conversion rates"],
    icon: "search",
  },
  {
    title: "Global organizations",
    description: "Ship cross-time-zone products with a distributed team spanning Germany, Egypt, and the USA.",
    outcomes: ["Follow-the-sun delivery", "Shared standards", "Predictable communication"],
    icon: "globe",
  },
];

export interface Service {
  title: string;
  description: string;
  bullets: string[];
  icon: IconKey;
}

export const services: Service[] = [
  {
    title: "Websites and web apps",
    description: "Conversion-focused websites and custom web applications designed for real business outcomes.",
    bullets: ["Design systems", "App architecture", "Analytics-ready delivery"],
    icon: "layout",
  },
  {
    title: "Business systems",
    description: "Internal platforms and modern ERP alternatives tailored to your operations.",
    bullets: ["Workflow automation", "Role-based access", "Unified data views"],
    icon: "workflow",
  },
  {
    title: "SEO and performance",
    description: "Technical optimization that improves discoverability, speed, and user retention.",
    bullets: ["Core Web Vitals", "Structured metadata", "Performance budgets"],
    icon: "search",
  },
  {
    title: "RAG and AI assistants",
    description: "Practical AI copilots grounded in your own documentation, policies, and data.",
    bullets: ["Knowledge ingestion", "Source-cited responses", "Guardrailed behavior"],
    icon: "brain",
  },
  {
    title: "Microsoft web parts",
    description: "Enterprise-ready SharePoint and portal experiences integrated into existing environments.",
    bullets: ["Intranet enhancements", "Component libraries", "Governance-aware builds"],
    icon: "building",
  },
  {
    title: "All-in-one delivery",
    description: "Strategy, design, engineering, and iteration under one accountable team.",
    bullets: ["Single roadmap", "Cross-functional execution", "Long-term support"],
    icon: "sparkles",
  },
];

export interface WorkItem {
  title: string;
  summary: string;
  industry: string;
  outcome: string;
  tags: string[];
  techStack: string[];
  imageSrc: string;
}

export const workItems: WorkItem[] = [
  {
    title: "Atlas Operations Portal",
    summary: "A unified operations platform that replaced fragmented internal tools.",
    industry: "Logistics",
    outcome: "37% faster case handling",
    tags: ["Internal Systems", "Workflow"],
    techStack: ["Next.js", "TypeScript", "PostgreSQL"],
    imageSrc: "/work/work-1.svg",
  },
  {
    title: "Northline Partner Hub",
    summary: "A secure enterprise portal for vendor onboarding, approvals, and reporting.",
    industry: "Manufacturing",
    outcome: "2.4x onboarding throughput",
    tags: ["Enterprise", "Portal"],
    techStack: ["React", "Azure", "Graph API"],
    imageSrc: "/work/work-2.svg",
  },
  {
    title: "Crestline Commerce Suite",
    summary: "A performance-first commerce frontend with tailored editorial workflows.",
    industry: "Retail",
    outcome: "51% increase in conversion",
    tags: ["Website", "Performance"],
    techStack: ["Next.js", "Headless CMS", "Vercel"],
    imageSrc: "/work/work-3.svg",
  },
  {
    title: "Meridian Knowledge Assistant",
    summary: "A RAG assistant connected to policy docs and product runbooks.",
    industry: "Fintech",
    outcome: "64% fewer support escalations",
    tags: ["AI", "RAG"],
    techStack: ["OpenAI", "Vector DB", "Node.js"],
    imageSrc: "/work/work-4.svg",
  },
  {
    title: "Helix Field Service Console",
    summary: "A scheduling and dispatch web app for distributed field teams.",
    industry: "Energy",
    outcome: "29% reduction in idle time",
    tags: ["Web App", "Scheduling"],
    techStack: ["TypeScript", "Prisma", "Tailwind"],
    imageSrc: "/work/work-5.svg",
  },
  {
    title: "Pioneer Insights Engine",
    summary: "A reporting suite translating operational data into executive-ready insights.",
    industry: "Healthcare",
    outcome: "Weekly reporting cut from 9h to 2h",
    tags: ["Analytics", "Automation"],
    techStack: ["Next.js", "dbt", "Power BI"],
    imageSrc: "/work/work-6.svg",
  },
];

export interface ProcessStep {
  step: string;
  title: string;
  description: string;
}

export const processSteps: ProcessStep[] = [
  {
    step: "01",
    title: "Discovery and alignment",
    description: "We align on business goals, user needs, and technical constraints in one working brief.",
  },
  {
    step: "02",
    title: "System and product design",
    description: "We define architecture, data flows, and interfaces before delivery starts.",
  },
  {
    step: "03",
    title: "Build and integrate",
    description: "Cross-functional squads ship production-ready increments with weekly visibility.",
  },
  {
    step: "04",
    title: "Launch and optimize",
    description: "We launch safely, monitor performance, and iterate against measurable outcomes.",
  },
  {
    step: "05",
    title: "Scale with confidence",
    description: "We extend capabilities, automate bottlenecks, and support long-term growth.",
  },
];

export interface TeamMember {
  name: string;
  role: string;
  location: string;
  initials: string;
  specialties: string[];
}

export const teamMembers: TeamMember[] = [
  {
    name: "Maya Schneider",
    role: "Product Strategy",
    location: "Berlin, Germany",
    initials: "MS",
    specialties: ["Discovery", "Roadmapping"],
  },
  {
    name: "Omar Tarek",
    role: "Engineering Lead",
    location: "Cairo, Egypt",
    initials: "OT",
    specialties: ["Architecture", "Systems"],
  },
  {
    name: "Avery Brooks",
    role: "Experience Design",
    location: "Austin, USA",
    initials: "AB",
    specialties: ["UI Systems", "Prototyping"],
  },
  {
    name: "Leila Hassan",
    role: "AI Solutions",
    location: "Alexandria, Egypt",
    initials: "LH",
    specialties: ["RAG", "Prompt Ops"],
  },
  {
    name: "Jonah Carter",
    role: "Enterprise Delivery",
    location: "Seattle, USA",
    initials: "JC",
    specialties: ["Microsoft Stack", "Governance"],
  },
  {
    name: "Felix Braun",
    role: "Performance and SEO",
    location: "Munich, Germany",
    initials: "FB",
    specialties: ["Core Web Vitals", "Technical SEO"],
  },
];

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "They became our end-to-end digital partner. Strategy, build, and optimization finally moved as one system.",
    author: "Nadia Elmasry",
    role: "COO",
    company: "Northline Group",
  },
  {
    quote:
      "The team translated complex operations into software our departments actually enjoy using every day.",
    author: "Martin Keller",
    role: "Head of Operations",
    company: "Helix Industrial",
  },
  {
    quote:
      "From SEO wins to internal platform delivery, execution quality stayed consistently high across the board.",
    author: "Samantha Reed",
    role: "VP Digital",
    company: "Crestline Commerce",
  },
];

export interface InsightItem {
  title: string;
  excerpt: string;
  topic: string;
  readTime: string;
}

export const insights: InsightItem[] = [
  {
    title: "Designing business systems teams will actually adopt",
    excerpt: "Practical patterns for reducing tool fatigue and increasing daily usage in operations-heavy teams.",
    topic: "Systems Design",
    readTime: "6 min read",
  },
  {
    title: "Where RAG assistants create immediate enterprise value",
    excerpt: "How to prioritize high-impact use cases without overengineering your AI roadmap.",
    topic: "AI Delivery",
    readTime: "7 min read",
  },
  {
    title: "Performance as a growth function, not a technical chore",
    excerpt: "Connecting speed improvements to measurable conversion and retention gains.",
    topic: "SEO & Performance",
    readTime: "5 min read",
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "What does all-in-one engagement mean in practice?",
    answer:
      "You work with one accountable team handling strategy, design, engineering, integration, and post-launch optimization.",
  },
  {
    question: "Do you work with distributed teams and multiple time zones?",
    answer:
      "Yes. Our team operates across Germany, Egypt, and the USA, and we structure delivery to keep communication predictable.",
  },
  {
    question: "Can you modernize existing systems instead of rebuilding everything?",
    answer:
      "Absolutely. We often incrementally modernize legacy workflows, portals, and business systems without disruptive full rewrites.",
  },
  {
    question: "How do you handle enterprise security and governance needs?",
    answer:
      "We design with role-based access, auditability, and platform governance in mind, especially for enterprise portals and integrations.",
  },
  {
    question: "What is a typical project timeline?",
    answer:
      "Most engagements start with a focused discovery sprint, then move into phased delivery with weekly milestones and transparent reporting.",
  },
];

export const globalStats = [
  { label: "Regions", value: "3" },
  { label: "Disciplines", value: "6" },
  { label: "Avg. launch cycle", value: "8-12 weeks" },
];
