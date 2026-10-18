import { describe, expect, it } from "vitest";
import {
  canManageCatalogue,
  canReceiveStock,
  canTransferFrom,
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

  it("allows operational transfers only out of the staff member's granted source branch", () => {
    expect(canTransferFrom(staff("attendant", ["branch-a"]), "branch-a")).toBe(true);
    expect(canTransferFrom(staff("attendant", ["branch-a"]), "branch-b")).toBe(false);
    expect(canTransferFrom(staff("manager", ["branch-a"]), "branch-a")).toBe(true);
    expect(canTransferFrom(staff("admin", []), "branch-b")).toBe(true);
    expect(canTransferFrom(staff("director", []), "branch-b")).toBe(true);
  });
});
