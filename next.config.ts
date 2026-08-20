import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  images: {
    // The work screenshots are the only images on the site. AVIF first, WebP
    // for anything that cannot take it.
    formats: ["image/avif", "image/webp"],
  },
};

/** `npm run analyze` opens the treemap; every other build is untouched. */
export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "1" })(nextConfig);
