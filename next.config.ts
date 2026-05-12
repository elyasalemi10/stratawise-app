import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // OC creation wizard accepts Plan-of-Subdivision PDFs up to 50MB.
      bodySizeLimit: "50mb",
    },
  },
  async redirects() {
    return [
      // Common alternative paths → canonical /sign-in and /sign-up
      { source: "/login", destination: "/sign-in", permanent: false },
      { source: "/signin", destination: "/sign-in", permanent: false },
      { source: "/log-in", destination: "/sign-in", permanent: false },
      { source: "/signup", destination: "/sign-up", permanent: false },
      { source: "/register", destination: "/sign-up", permanent: false },
      { source: "/forgot", destination: "/forgot-password", permanent: false },
      // Sign-out URL aliases — all route to /logout which clears the session
      // and bounces to /. Useful when a user gets into a weird stale state.
      { source: "/sign-out", destination: "/logout", permanent: false },
      { source: "/signout", destination: "/logout", permanent: false },
      { source: "/log-out", destination: "/logout", permanent: false },
    ];
  },
};

export default nextConfig;
