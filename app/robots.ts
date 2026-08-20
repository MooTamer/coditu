import type { MetadataRoute } from "next";

import { getAbsoluteUrl, getSiteOrigin } from "@/lib/site-url";

/**
 * The delivery app is private. It is already behind auth, but a crawler that
 * finds a link should not spend its budget getting redirected to `/login`, and
 * the sprint report route must never be indexed if a token ever leaks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/login", "/dev/"],
    },
    sitemap: getAbsoluteUrl("/sitemap.xml"),
    host: getSiteOrigin(),
  };
}
