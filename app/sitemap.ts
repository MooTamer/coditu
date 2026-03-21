import type { MetadataRoute } from "next";

import { marketingContent } from "@/lib/marketing-content";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: marketingContent.siteMeta.siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
