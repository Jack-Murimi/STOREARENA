"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCustomerContext } from "@/lib/db";
import type { Database } from "@/lib/customers/repository";
import { currentStaffAccess, type StaffAccess } from "@/lib/auth";

const ROLES = ["attendant", "manager", "director", "admin"] as const;
type Role = (typeof ROLES)[number];

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const branchesFrom = (form: FormData): string[] =>
  form
    .getAll("branch_id")
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);

const appOrigin = (): string =>
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

function fail(message: string): never {
  redirect(`/users?error=${encodeURIComponent(message)}`);
}

/**
 * Every action here is admin-only. `currentStaffAccess` reads app_users, so a
 * session that has been deactivated since the last page load is refused even
 * before the role check.
 */
async function requireAdmin(): Promise<{ staff: StaffAccess; db: Database }> {
  const staff = await currentStaffAccess();
  if (!staff) fail("Sign in is required.");
  if (staff.role !== "admin") fail("Only an Admin can manage staff accounts.");
  const { products } = await getCustomerContext();
  if (!products) fail("The database is unavailable.");
  return { staff, db: products.db };
}

/**
 * How many *other* active admins remain. Deactivating or demoting the last one
 * would leave the portal with nobody able to invite, reset or reassign staff —
 * a lockout that needs database access to undo.
 */
async function otherActiveAdmins(db: Database, exceptId: string): Promise<number> {
  const rows = await db.query<{ count: number }>(
    "select count(*)::int as count from app_users where role = 'admin' and is_active and id <> $1",
    [exceptId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function inviteStaff(form: FormData): Promise<void> {
  const { staff, db } = await requireAdmin();

  const name = text(form, "name");
  const email = text(form, "email").toLowerCase();
  const role = text(form, "role") as Role;
  const branchIds = branchesFrom(form);

  if (name.length < 2 || !email.includes("@")) fail("Enter the staff member’s name and email.");
  if (!ROLES.includes(role)) fail("Choose a valid role.");
  if ((role === "attendant" || role === "manager") && branchIds.length === 0) {
    fail("Choose a branch for an attendant or manager.");
  }

  const existing = await db.query("select id from app_users where email = $1", [email]);
  if (existing[0]) fail("That email already has an account.");

  const origin = appOrigin();
  if (!origin) fail("App URL is not configured for invitation redirects.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/set-password`,
    data: { full_name: name },
  });
  if (error || !data.user) {
    fail("Invitation could not be sent. Check the email address and Auth email settings.");
  }

  // The auth user exists from this point. If the profile insert fails, delete
  // it again: an account with a session but no app_users row used to keep
  // full read access to customers and balances (it is now sent to /no-access,
  // but leaving orphans behind is still a mess to clean up by hand).
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "insert into app_users (id, email, full_name, role, is_active) values ($1, $2, $3, $4, true)",
        [data.user.id, email, name, role],
      );
      for (const branchId of branchIds) {
        await tx.query(
          "insert into user_branches (user_id, branch_id, granted_by) values ($1, $2, $3)",
          [data.user.id, branchId, staff.id],
        );
      }
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
    fail(`The invitation could not be saved: ${(error as Error).message.split("\n")[0]}`);
  }

  revalidatePath("/users");
  redirect(
    `/users?saved=${encodeURIComponent(`Invitation sent to ${name}. They will choose their own password.`)}`,
  );
}

export async function updateStaff(form: FormData): Promise<void> {
  const { staff, db } = await requireAdmin();

  const id = text(form, "id");
  const name = text(form, "name");
  const role = text(form, "role") as Role;
  const branchIds = branchesFrom(form);
  const active = form.get("active") === "on";

  if (!id || name.length < 2 || !ROLES.includes(role)) fail("Enter a valid name and role.");
  if ((role === "attendant" || role === "manager") && branchIds.length === 0) {
    fail("Choose at least one branch for an attendant or manager.");
  }
  if (id === staff.id && role !== staff.role) fail("You cannot change your own role.");
  if (id === staff.id && !active) fail("You cannot deactivate your own account.");

  const before = await db.query<{ role: string; is_active: boolean }>(
    "select role, is_active from app_users where id = $1",
    [id],
  );
  const previous = before[0];
  if (!previous) fail("That staff account no longer exists.");

  const losesAdmin = previous.role === "admin" && (role !== "admin" || !active);
  if (losesAdmin && (await otherActiveAdmins(db, id)) === 0) {
    fail("This is the last active Admin. Promote someone else first.");
  }

  await db.transaction(async (tx) => {
    await tx.query("update app_users set full_name = $2, role = $3, is_active = $4 where id = $1", [
      id,
      name,
      role,
      active,
    ]);

    // Replace the grant set with exactly what was submitted. The old code
    // deleted every row and re-inserted one "primary" branch, so editing a
    // manager's name silently revoked their second branch.
    await tx.query("delete from user_branches where user_id = $1", [id]);
    for (const branchId of branchIds) {
      await tx.query(
        "insert into user_branches (user_id, branch_id, granted_by) values ($1, $2, $3)",
        [id, branchId, staff.id],
      );
    }
  });

  // Deactivation must also close the login. Without this the person keeps a
  // valid Supabase session and can still read every customer and balance via
  // the REST API, because the app talks to Postgres as its owner and never
  // runs as `authenticated`. Bans are reversed on reactivation.
  try {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : "876000h",
    });
  } catch (error) {
    console.warn(`[users] auth ban sync failed for ${id}: ${(error as Error).message}`);
  }

  revalidatePath("/users");
  redirect(`/users?saved=${encodeURIComponent("Staff account updated.")}`);
}

export async function sendPasswordReset(form: FormData): Promise<void> {
  await requireAdmin();
  const email = text(form, "email");
  const origin = appOrigin();
  if (!email || !origin) fail("Email reset is not configured.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/set-password`,
  });
  if (error) fail("Password reset email could not be sent right now.");
  redirect(
    `/users?saved=${encodeURIComponent("Password-set email sent. The member chooses their own private password.")}`,
  );
}
