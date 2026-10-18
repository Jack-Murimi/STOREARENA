"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCustomerContext } from "@/lib/db";
const text=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
function fail(message:string):never { redirect(`/users?error=${encodeURIComponent(message)}`); }
export async function inviteStaff(form: FormData): Promise<void> {
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) fail("Sign in is required.");
 const {products}=await getCustomerContext(); if(!products) fail("The database is unavailable.");
 const [actor]=await products.db.query<{role:string}>("select role from app_users where id=$1 and is_active",[user.id]); if(actor?.role!=="admin") fail("Only an Admin can invite staff.");
 const name=text(form,"name"),email=text(form,"email").toLowerCase(),role=text(form,"role"),branch=text(form,"branch_id"); if(name.length<2||!email.includes("@")) fail("Enter the staff member’s name and email."); if(!["attendant","manager","director","admin"].includes(role)) fail("Choose a valid role."); if((role==="attendant"||role==="manager")&&!branch) fail("Choose a branch for an attendant or manager.");
 const existing=await products.db.query("select id from app_users where email=$1",[email]); if(existing[0]) fail("That email already has an account.");
 const origin=process.env.NEXT_PUBLIC_APP_URL; if(!origin) fail("App URL is not configured for invitation redirects.");
 const admin=createSupabaseAdminClient(); const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${origin}/auth/callback?next=/auth/set-password`,data:{full_name:name}}); if(error||!data.user) fail("Invitation could not be sent. Check the email address and Auth email settings.");
 await products.db.transaction(async tx=>{await tx.query("insert into app_users (id,email,full_name,role,is_active) values ($1,$2,$3,$4,true)",[data.user.id,email,name,role]); if(branch) await tx.query("insert into user_branches (user_id,branch_id,granted_by) values ($1,$2,$3)",[data.user.id,branch,user.id]);});
 revalidatePath("/users"); redirect(`/users?saved=${encodeURIComponent(`Invitation sent to ${name}. They will choose their own password.`)}`);
}

export async function updateStaff(form: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) fail("Sign in is required.");
  const { products } = await getCustomerContext(); if (!products) fail("The database is unavailable.");
  const [actor] = await products.db.query<{ role: string }>("select role from app_users where id=$1 and is_active", [user.id]); if (actor?.role !== "admin") fail("Only an Admin can update staff accounts.");
  const id = text(form, "id"), name = text(form, "name"), role = text(form, "role"), branch = text(form, "branch_id"), active = form.get("active") === "on";
  if (!id || name.length < 2 || !["attendant", "manager", "director", "admin"].includes(role)) fail("Enter a valid name and role.");
  if ((role === "attendant" || role === "manager") && !branch) fail("Choose a branch for an attendant or manager.");
  await products.db.transaction(async tx => { await tx.query("update app_users set full_name=$2, role=$3, is_active=$4 where id=$1", [id, name, role, active]); await tx.query("delete from user_branches where user_id=$1", [id]); if (branch) await tx.query("insert into user_branches (user_id,branch_id,granted_by) values ($1,$2,$3)", [id, branch, user.id]); });
  revalidatePath("/users"); redirect(`/users?saved=${encodeURIComponent("Staff account updated.")}`);
}

export async function sendPasswordReset(form: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) fail("Sign in is required.");
  const { products } = await getCustomerContext(); if (!products) fail("The database is unavailable.");
  const [actor] = await products.db.query<{ role: string }>("select role from app_users where id=$1 and is_active", [user.id]); if (actor?.role !== "admin") fail("Only an Admin can send password reset emails.");
  const email = text(form, "email"); const origin = process.env.NEXT_PUBLIC_APP_URL; if (!email || !origin) fail("Email reset is not configured.");
  const admin = createSupabaseAdminClient(); const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/auth/set-password` }); if (error) fail("Password reset email could not be sent right now.");
  redirect(`/users?saved=${encodeURIComponent("Password-set email sent. The member chooses their own private password.")}`);
}
