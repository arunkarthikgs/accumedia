import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
