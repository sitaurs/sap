import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: process.env.SAP_ALLOWED_DEV_ORIGINS?.split(",").map((host) => host.trim()).filter(Boolean) ?? [],
};

export default nextConfig;
