import type { MetadataRoute } from "next";

import { marketingContent } from "@/lib/marketing-content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${marketingContent.siteMeta.siteUrl}/sitemap.xml`,
    host: marketingContent.siteMeta.siteUrl,
  };
}
