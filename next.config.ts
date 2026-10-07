import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // the floating dev badge sits on top of the sidebar's account menu
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
