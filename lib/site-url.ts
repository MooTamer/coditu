import { marketingContent } from "@/lib/marketing-content";

const LOCALHOST_FALLBACK = "http://localhost:3000";

function toUrl(value: string | undefined): URL | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

export function getSiteUrl(): URL {
  const fromEnv = toUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (fromEnv) return fromEnv;

  // Use Vercel-provided deployment URLs when a public site URL isn't explicitly set.
  // This keeps OG/Twitter URLs aligned with the actual deployed domain.
  const fromVercelProduction = toUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (fromVercelProduction) return fromVercelProduction;

  const fromVercelDeployment = toUrl(process.env.VERCEL_URL);
  if (fromVercelDeployment) return fromVercelDeployment;

  if (process.env.NODE_ENV === "production") {
    const fromContent = toUrl(marketingContent.siteMeta.siteUrl);
    if (fromContent) return fromContent;
  }

  return new URL(LOCALHOST_FALLBACK);
}

export function getSiteOrigin(): string {
  return getSiteUrl().origin;
}

export function getAbsoluteUrl(path: string): string {
  return new URL(path, getSiteUrl()).toString();
}
