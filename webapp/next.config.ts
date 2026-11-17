import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Include local RAG index in serverless/tracing output
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/rag/**/*"],
  },
};

export default nextConfig;
