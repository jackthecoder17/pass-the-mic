import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // the old static site linked these (and Google's sign-in consent screen still does)
  async rewrites() {
    return [
      { source: "/privacy.html", destination: "/privacy" },
      { source: "/terms.html", destination: "/terms" },
    ];
  },
  async headers() {
    // the service worker must never be served stale, or a deploy can't replace it
    return [{ source: "/sw.js", headers: [{ key: "cache-control", value: "no-cache" }] }];
  },
};

export default nextConfig;
