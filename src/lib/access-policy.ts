/**
 * Pure application authorisation policy. Kept independent of Auth and the
 * database so every mutation and test uses exactly the same role rules.
 */
export const APP_ROLES = ["attendant", "manager", "director", "admin"] as const;
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

/** Transfers remain operational work: attendants/managers send only from granted source branches. */
export const canTransferFrom = (staff: StaffAccess, branchId: string): boolean =>
  staff.role === "admin" ||
  staff.role === "director" ||
  staff.branchIds.includes(branchId);
