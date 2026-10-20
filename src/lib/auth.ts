import { getCustomerContext } from "@/lib/db";
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
export async function currentStaffAccess(): Promise<StaffAccess | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { products } = await getCustomerContext();
    if (!products) return null;
    const profiles = await products.db.query<{ full_name: string; role: string }>(
      "select full_name, role from app_users where id = $1 and is_active",
      [user.id],
    );
    const profile = profiles[0];
    if (!profile || !APP_ROLES.includes(profile.role as AppRole)) return null;

    const grants = await products.db.query<{ branch_id: string }>(
      "select branch_id from user_branches where user_id = $1 order by branch_id",
      [user.id],
    );
    return {
      id: user.id,
      fullName: profile.full_name,
      role: profile.role as AppRole,
      branchIds: grants.map((grant) => grant.branch_id),
    };
  } catch {
    return null;
  }
}

/** A rendering-friendly view of the same trusted authorisation record. */
export async function authenticatedStaff(): Promise<StaffMember | null> {
  const staff = await currentStaffAccess();
  return staff
    ? { name: staff.fullName, initials: initials(staff.fullName), role: label(staff.role) }
    : null;
}
