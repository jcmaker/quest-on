import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    unoptimized: true, // sharp 사용 안 함
  },
};

export default nextConfig;
