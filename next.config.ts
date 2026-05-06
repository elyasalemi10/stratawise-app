import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships ESM with a dynamically-imported worker — Turbopack
  // rewrites that import path during bundling, so worker resolution breaks at
  // runtime ("Setting up fake worker failed" pointing at .next/dev/server).
  // Externalising it leaves pdfjs-dist as a plain Node import; the worker
  // file then resolves correctly from node_modules.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
