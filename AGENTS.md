<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Gateway Gas Portal — Project Rules

**Project:** Gateway Gas Portal — a Next.js staff portal hosted on Vercel with a Supabase (Postgres) backend.

---

## UI Rules

- Brand accent is orange. The exact hex values are `#f97316` (primary fills, buttons, focus ring), `#ea580c` (pressed/hover), and `#c2410c` (orange text and links on light backgrounds — 4.5:1 contrast). Do not introduce any new accent colours.
- Dense, uncluttered layouts. Reuse existing components from `src/components/` before creating new ones.
- One font family (`ui-sans-serif, system-ui` — no external font imports), a consistent spacing scale (defined in `src/app/globals.css` `@theme`), and consistent empty, loading, and error states on every page.
- Forms: show a clear inline error under every empty or invalid field. The Save/Submit button must be disabled during submission and show a loading label. Never silently fail.
- Mobile-friendly and accessible: every `<input>` must have a `<label>` with a matching `htmlFor`/`id`, interactive elements must have visible focus states (orange ring), and colour must never be the sole indicator of state.
- Before building or significantly changing any UI, load the **frontend-design** and **design-taste-frontend** skills.

---

## Security Rules

- RLS must be enabled on every Supabase table, with explicit policies per role. Never rely on hiding UI elements as the only access control.
- Role enforcement (director, admin, manager, attendant, rider) must happen on the server — in RLS policies and in server actions via `currentStaffAccess()` — never only by conditionally rendering buttons in the client.
- The `SUPABASE_SERVICE_ROLE_KEY` and any other secrets must never appear in client code or in `NEXT_PUBLIC_` environment variables. Only the publishable anon key belongs in the browser.
- Validate and sanitize all form inputs on the server (server actions) before touching the database.
- Never hardcode redirect URLs. Use `NEXT_PUBLIC_APP_URL` for auth redirects. Never use `VERCEL_URL` directly as a site URL (it changes per deployment).
- Sensitive actions — editing invoices, stock adjustments, price changes, role changes — must write to the audit trail.
- Before touching auth, database, or API code, load the **security-and-hardening** and **supabase-postgres-best-practices** skills.

---

## Workflow Rules

- Work in small, self-contained slices. Stop at a checkpoint after each one and confirm before continuing.
- After each feature or fix, review your own diff against the security rules above and list any violations before committing.
- Provide complete files, not partial snippets with `// ... rest of file`.
- Run `npx tsc --noEmit` and `npx next build` to verify the build passes before pushing.
