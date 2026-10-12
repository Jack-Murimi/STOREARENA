import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) { const code = request.nextUrl.searchParams.get("code"); const next = request.nextUrl.searchParams.get("next") || "/"; if (code) { const supabase = await createSupabaseServerClient(); await supabase.auth.exchangeCodeForSession(code); } return NextResponse.redirect(new URL(next, request.url)); }
