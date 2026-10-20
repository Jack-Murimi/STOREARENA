import type { NextConfig } from "next";

/**
 * Response headers applied to every route.
 *
 * An internal portal is still a browser-visible web app: the CSP removes the
 * ability to load a script from anywhere but this origin, and the rest stop the
 * clickjacking and MIME-sniffing tricks that the missing defaults allowed.
 *
 * `'unsafe-inline'` for styles is required by Tailwind's inlined critical CSS
 * and by Next's runtime style injection. Scripts keep 'unsafe-inline' off; if a
 * dependency ever needs it, add a nonce through middleware rather than remove
 * the policy.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Supabase auth is called from the browser for session refresh.
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /**
   * Both database packages must be loaded by Node, not bundled:
   *
   * - `@electric-sql/pglite` resolves its PostgreSQL WebAssembly files from its
   *   own directory at runtime, which breaks once a bundler rewrites the paths.
   * - `postgres` loads optional drivers dynamically.
   */
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
