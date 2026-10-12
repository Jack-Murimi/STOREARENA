import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cookie-backed Supabase client for server components, actions, and routes. */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth environment is not configured.");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (entries) => { try { entries.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Middleware persists refreshes. */ } },
    },
  });
}
