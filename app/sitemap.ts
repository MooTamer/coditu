import type { MetadataRoute } from "next";

import { getAbsoluteUrl } from "@/lib/site-url";

/**
 * One public page. `/app` is behind auth and `/login` is a door, not content —
 * neither belongs in a sitemap, and `/app/**` is disallowed in `robots.ts`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getAbsoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
