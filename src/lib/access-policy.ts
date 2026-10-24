/**
 * Pure application authorisation policy. Kept independent of Auth and the
 * database so every mutation and test uses exactly the same role rules.
 */
export const APP_ROLES = ["attendant", "manager", "director", "admin", "rider"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export interface StaffAccess {
  id: string;
  fullName: string;
  role: AppRole;
  branchIds: string[];
}

export const canManageCatalogue = (staff: StaffAccess): boolean =>
  staff.role === "admin" || staff.role === "director";

export const canReceiveStock = (staff: StaffAccess, branchId: string): boolean =>
  staff.role === "admin" ||
  staff.role === "director" ||
  (staff.role === "manager" && staff.branchIds.includes(branchId));

/**
 * Customer records are shared across branches, so an attendant may add one at
 * the counter - but correcting an address or a phone number is a manager's act.
 * The deletion path is a deactivation for the same reason (see
 * docs/RLS_PLAN.md): history must keep its customer.
 */
export const canManageCustomers = (staff: StaffAccess): boolean =>
  staff.role === "manager" || staff.role === "admin" || staff.role === "director";

/**
 * Balances, invoices and payments are manager-and-above. This is the rule the
 * database policies were written against; the screens now enforce the same
 * thing instead of relying on the connection role.
 */
export const canViewBilling = (staff: StaffAccess): boolean =>
  staff.role === "manager" || staff.role === "admin" || staff.role === "director";

/**
 * Sales belong to a branch. An attendant or manager may only post to a branch
 * they hold a grant for; admin and director may post anywhere.
 */
export const canSellFrom = (staff: StaffAccess, branchId: string): boolean =>
  staff.role === "admin" || staff.role === "director" || staff.branchIds.includes(branchId);

/** Transfers remain operational work: attendants/managers send only from granted source branches. */
export const canTransferFrom = (staff: StaffAccess, branchId: string): boolean =>
  staff.role === "admin" ||
  staff.role === "director" ||
  staff.branchIds.includes(branchId);
