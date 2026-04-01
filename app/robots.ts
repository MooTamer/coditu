import type { MetadataRoute } from "next";

import { getAbsoluteUrl, getSiteOrigin } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: getAbsoluteUrl("/sitemap.xml"),
    host: getSiteOrigin(),
  };
}
