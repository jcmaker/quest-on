import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["sharp"],
  // Increase body size limit for file uploads
  experimental: {
    // Increase timeout for file uploads
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;
