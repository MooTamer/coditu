<p align="center">
  <img src="./public/logo.png" alt="Strukture Digital logo" width="88" />
</p>

<h1 align="center">Strukture Digital</h1>

<p align="center">
  Distributed software house website for Strukture Digital, built with Next.js App Router and a typed marketing content model.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1.6-111111?logo=nextdotjs" alt="Next.js 16.1.6" />
  <img src="https://img.shields.io/badge/React-19.2.3-149ECA?logo=react&logoColor=white" alt="React 19.2.3" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/shadcn%2Fui-New_York-18181B" alt="shadcn/ui" />
  <img src="https://img.shields.io/badge/Framer_Motion-12.34.3-0F172A" alt="Framer Motion 12.34.3" />
</p>

---

## 📚 Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Quickstart](#-quickstart)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [UI/UX Notes](#-uiux-notes)
- [Deployment](#-deployment)
- [Screenshots / Preview](#-screenshots--preview)
- [Contributing](#-contributing)

---

## 🔎 Overview
This repository contains a marketing site for **Strukture Digital**. It uses the App Router with mostly server-rendered sections, while keeping interactive and animated pieces as focused client components.

---

## ✨ Key Features
- App Router architecture with server-first section composition.
- Typed, centralized copy/content model in [`lib/marketing-content.ts`](./lib/marketing-content.ts).
- Dedicated animation islands using Framer Motion (`hero`, cards, modal, carousel).
- Shared-layout Work card to modal transition via `layoutId`.
- Responsive container and section system built around reusable primitives.
- SEO setup via route metadata, Open Graph/Twitter cards, `robots.ts`, and `sitemap.ts`.
- Image optimization with `next/image` and explicit responsive `sizes` values.

---

## 🧰 Tech Stack
| Area | Tools in this repo |
| --- | --- |
| Framework | Next.js `16.1.6` (App Router) |
| UI | React `19.2.3`, shadcn/ui, Radix UI primitives, Lucide icons |
| Styling | Tailwind CSS `4`, `tw-animate-css`, CSS variables in `app/globals.css` |
| Motion | Framer Motion `12.34.3` |
| Language | TypeScript `5` |
| Quality | ESLint `9` + `eslint-config-next` |

---

## 🚀 Quickstart
> This repo uses **npm** (`package-lock.json` is present).

### 1) Install dependencies
```bash
npm install
```

### 2) Run in development
```bash
npm run dev
```

### 3) Build for production
```bash
npm run build
```

### 4) Start production server
```bash
npm run start
```

### 5) Run lint checks
```bash
npm run lint
```

---

## 🗂️ Project Structure
```text
.
├── app
│   ├── (marketing)/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── robots.ts
│   └── sitemap.ts
├── components
│   ├── landing/
│   ├── theme-provider.tsx
│   └── ui/
├── docs
│   └── preview/
├── lib
│   ├── fonts.ts
│   ├── icon-map.ts
│   ├── marketing-content.ts
│   ├── motion.ts
│   └── utils.ts
├── public
│   ├── logo.png
│   ├── og.png
│   └── work/
├── components.json
├── next.config.ts
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

---

## ⚙️ Configuration
### Content and copy
- Main marketing copy, section data, and work items: [`lib/marketing-content.ts`](./lib/marketing-content.ts)
- Site metadata base/title/image values: [`lib/marketing-content.ts`](./lib/marketing-content.ts), consumed in:
  - [`app/layout.tsx`](./app/layout.tsx)
  - [`app/(marketing)/page.tsx`](./app/(marketing)/page.tsx)

### Environment variables
- No runtime environment variables are currently required for local development.

---

## 🎛️ UI/UX Notes
- **Motion + accessibility:** reduced motion is respected through:
  - `useReducedMotion()` checks in animated client components
  - a global `@media (prefers-reduced-motion: reduce)` fallback in [`app/globals.css`](./app/globals.css)
- **Server-first rendering:** section wrappers and page composition are server components by default; client boundaries are localized to interaction-heavy parts.
- **Minimal client surface area:** key interactive islands include:
  - [`components/landing/work-gallery.client.tsx`](./components/landing/work-gallery.client.tsx)
  - [`components/landing/work-modal.tsx`](./components/landing/work-modal.tsx)
  - [`components/landing/media-carousel.tsx`](./components/landing/media-carousel.tsx)

---

## 📦 Deployment
No provider-specific deployment config is committed (for example, no `vercel.json` or Docker setup).

Deploy as a standard Next.js app:
```bash
npm run build
npm run start
```

---

## 🖼️ Screenshots / Preview
Add screenshots to [`docs/preview`](./docs/preview) using these filenames:
- `home-desktop.png`
- `home-mobile.png`
- `work-modal.png`

Then reference them here:
```md
![Home Desktop](./docs/preview/home-desktop.png)
![Home Mobile](./docs/preview/home-mobile.png)
![Work Modal](./docs/preview/work-modal.png)
```

---

## 🤝 Contributing
1. Create a branch from `main`.
2. Keep server components server-first; add client boundaries only where interaction is required.
3. Keep content/schema changes in sync with types in [`lib/marketing-content.ts`](./lib/marketing-content.ts).
4. Run before opening a PR:
   ```bash
   npm run lint
   npm run build
   ```
