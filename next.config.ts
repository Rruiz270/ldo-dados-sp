import type { NextConfig } from "next";

// Quando montado em institutoi10.com.br/ldo-dados/* via Vercel rewrite,
// setar NEXT_PUBLIC_BASE_PATH=/ldo-dados.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
