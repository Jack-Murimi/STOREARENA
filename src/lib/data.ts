import type { CylinderStock, DailyTotals, SaleRecord, StaffMember } from "./types";

/**
 * Runtime business data is read from Supabase. This file intentionally carries
 * no demo stock, customers, sales, or staff identities: an empty business
 * starts empty until authorised staff record real operations.
 */
export const stock: CylinderStock[] = [];
export const salesToday: SaleRecord[] = [];
export const weekTotals: DailyTotals[] = [];

/** Only a rendering fallback during local configuration. AppShell replaces it
 * with the authenticated app_users profile in every configured deployment. */
export const currentStaff: StaffMember = {
  name: "Signed out",
  initials: "—",
  role: "",
};

export const stationName = "Gateway Gas Enterprises";
