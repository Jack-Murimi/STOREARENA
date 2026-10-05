import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Both database packages must be loaded by Node, not bundled:
   *
   * - `@electric-sql/pglite` resolves its PostgreSQL WebAssembly files from its
   *   own directory at runtime, which breaks once a bundler rewrites the paths.
   * - `postgres` loads optional drivers dynamically.
   */
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
