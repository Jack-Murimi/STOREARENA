import { getCustomerContext } from "@/lib/db";
import type { StaffMember } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const label = (role: string) => role.replace(/\b\w/g, (letter) => letter.toUpperCase());

/** Identity comes from Supabase Auth; authorisation identity/role comes from
 * app_users. UI code must not invent a staff member. */
export async function authenticatedStaff(): Promise<StaffMember | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { products } = await getCustomerContext();
    if (!products) return null;
    const rows = await products.db.query<{ full_name: string; role: string }>("select full_name, role from app_users where id = $1 and is_active", [user.id]);
    const profile = rows[0];
    return profile ? { name: profile.full_name, initials: initials(profile.full_name), role: label(profile.role) } : null;
  } catch { return null; }
}
