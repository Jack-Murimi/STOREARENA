import { getCustomerContext } from "@/lib/db";
import { cache } from "react";
import type { StaffMember } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { APP_ROLES } from "@/lib/access-policy";
import type { AppRole, StaffAccess } from "@/lib/access-policy";

export {
  APP_ROLES,
  canManageCatalogue,
  canManageCustomers,
  canReceiveStock,
  canSellFrom,
  canTransferFrom,
  canViewBilling,
} from "@/lib/access-policy";
export type { AppRole, StaffAccess } from "@/lib/access-policy";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
const label = (role: string) => role.replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * Identity comes from Supabase Auth; authorisation identity, role, and branch
 * grants come from app_users/user_branches. Never rely on editable metadata or
 * an actor name sent by the browser for a financial or stock mutation.
 */
export const currentStaffAccess = cache(async (): Promise<StaffAccess | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    // getSession() reads the cookie — no network call. Middleware already
    // verified the JWT, so a second getUser() round-trip is redundant here.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const userId = session.user.id;

    const { products } = await getCustomerContext();
    if (!products) return null;

    // Run both DB queries in parallel.
    const [profiles, grants] = await Promise.all([
      products.db.query<{ full_name: string; role: string }>(
        "select full_name, role from app_users where id = $1 and is_active",
        [userId],
      ),
      products.db.query<{ branch_id: string }>(
        "select branch_id from user_branches where user_id = $1 order by branch_id",
        [userId],
      ),
    ]);

    const profile = profiles[0];
    if (!profile || !APP_ROLES.includes(profile.role as AppRole)) return null;

    return {
      id: userId,
      fullName: profile.full_name,
      role: profile.role as AppRole,
      branchIds: grants.map((grant) => grant.branch_id),
    };
  } catch {
    return null;
  }
});

/** A rendering-friendly view of the same trusted authorisation record. */
export const authenticatedStaff = cache(async (): Promise<StaffMember | null> => {
  const staff = await currentStaffAccess();
  return staff
    ? { name: staff.fullName, initials: initials(staff.fullName), role: label(staff.role) }
    : null;
});
