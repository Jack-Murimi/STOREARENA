import { createClient } from "@supabase/supabase-js";
/** Service client: server actions/routes only. Never import this from client code. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin environment is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
