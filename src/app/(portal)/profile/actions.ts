"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCustomerContext } from "@/lib/db";
const text=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
function fail(message:string):never{redirect(`/profile?error=${encodeURIComponent(message)}`)}
export async function updateMyProfile(form:FormData):Promise<void>{const supabase=await createSupabaseServerClient();const{data:{user}}=await supabase.auth.getUser();if(!user)fail("Sign in is required.");const name=text(form,"full_name");if(name.length<2)fail("Enter your full name.");const{products}=await getCustomerContext();if(!products)fail("The database is unavailable.");await products.db.query("update app_users set full_name=$2 where id=$1",[user.id,name]);revalidatePath("/profile");revalidatePath("/");redirect("/profile?saved=Profile+updated");}
export async function updateMyPassword(form:FormData):Promise<void>{const password=text(form,"password"),confirm=text(form,"confirm_password");if(password.length<8||password!==confirm)fail("Use matching passwords of at least 8 characters.");const supabase=await createSupabaseServerClient();const{error}=await supabase.auth.updateUser({password});if(error)fail("Your password could not be changed. Sign in again and retry.");redirect("/profile?saved=Password+updated");}
