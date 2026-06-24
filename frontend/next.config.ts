import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.254.122', '192.168.5.31', '172.20.112.1'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;