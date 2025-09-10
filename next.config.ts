import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
  // Increase body size limit for file uploads
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
  // Configure serverless function timeout and memory
  serverless: {
    // Increase timeout for file uploads
    timeout: 60,
  },
};

export default nextConfig;
