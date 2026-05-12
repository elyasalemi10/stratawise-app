import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Common alternative paths → canonical /sign-in and /sign-up
      { source: "/login", destination: "/sign-in", permanent: false },
      { source: "/signin", destination: "/sign-in", permanent: false },
      { source: "/log-in", destination: "/sign-in", permanent: false },
      { source: "/signup", destination: "/sign-up", permanent: false },
      { source: "/register", destination: "/sign-up", permanent: false },
      { source: "/forgot", destination: "/forgot-password", permanent: false },
    ];
  },
};

export default nextConfig;
