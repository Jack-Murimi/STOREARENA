import { describe, expect, it } from "vitest";
import {
  canManageCatalogue,
  canManageCustomers,
  canReceiveStock,
  canSellFrom,
  canTransferFrom,
  canViewBilling,
  type StaffAccess,
} from "../access-policy";

const staff = (role: StaffAccess["role"], branchIds: string[] = ["branch-a"]): StaffAccess => ({
  id: `user-${role}`,
  fullName: "Trusted Staff",
  role,
  branchIds,
});

describe("staff access policy", () => {
  it("reserves catalogue administration for Admins and Directors", () => {
    expect(canManageCatalogue(staff("admin"))).toBe(true);
    expect(canManageCatalogue(staff("director"))).toBe(true);
    expect(canManageCatalogue(staff("manager"))).toBe(false);
    expect(canManageCatalogue(staff("attendant"))).toBe(false);
  });

  it("allows receipts only for senior roles or a manager's assigned branch", () => {
    expect(canReceiveStock(staff("admin", []), "any-branch")).toBe(true);
    expect(canReceiveStock(staff("director", []), "any-branch")).toBe(true);
    expect(canReceiveStock(staff("manager", ["branch-a"]), "branch-a")).toBe(true);
    expect(canReceiveStock(staff("manager", ["branch-a"]), "branch-b")).toBe(false);
    expect(canReceiveStock(staff("attendant", ["branch-a"]), "branch-a")).toBe(false);
  });

  it("keeps balances and supplier spend to managers and above", () => {
    expect(canViewBilling(staff("manager"))).toBe(true);
    expect(canViewBilling(staff("admin"))).toBe(true);
    expect(canViewBilling(staff("director"))).toBe(true);
    expect(canViewBilling(staff("attendant"))).toBe(false);
    expect(canManageCustomers(staff("manager"))).toBe(true);
    expect(canManageCustomers(staff("attendant"))).toBe(false);
  });

  it("posts a sale only to a branch the staff member may sell from", () => {
    expect(canSellFrom(staff("attendant", ["branch-a"]), "branch-a")).toBe(true);
    expect(canSellFrom(staff("attendant", ["branch-a"]), "branch-b")).toBe(false);
    expect(canSellFrom(staff("manager", []), "branch-b")).toBe(false);
    expect(canSellFrom(staff("admin", []), "branch-b")).toBe(true);
    expect(canSellFrom(staff("director", []), "branch-c")).toBe(true);
  });

  it("allows operational transfers only out of the staff member's granted source branch", () => {
    expect(canTransferFrom(staff("attendant", ["branch-a"]), "branch-a")).toBe(true);
    expect(canTransferFrom(staff("attendant", ["branch-a"]), "branch-b")).toBe(false);
    expect(canTransferFrom(staff("manager", ["branch-a"]), "branch-a")).toBe(true);
    expect(canTransferFrom(staff("admin", []), "branch-b")).toBe(true);
    expect(canTransferFrom(staff("director", []), "branch-b")).toBe(true);
  });
});
