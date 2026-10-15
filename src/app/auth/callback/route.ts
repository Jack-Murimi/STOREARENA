import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Supabase can deliver an invite as a PKCE `code` or as `token_hash` +
 * `type=invite`, depending on the project/email template. Handle both, and
 * attach refreshed session cookies to this exact redirect response. */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const destination = new URL(request.nextUrl.searchParams.get("next") || "/", request.url);
  if (!url || !key) {
    destination.pathname = "/login";
    destination.searchParams.set("error", "Authentication is not configured.");
    return NextResponse.redirect(destination);
  }

  const response = NextResponse.redirect(destination);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && (type === "invite" || type === "recovery" || type === "email_change")
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("The invitation link is missing its verification token.") };

  if (result.error) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "This invitation link has expired or was already used. Ask an Admin to resend it.");
    return NextResponse.redirect(login);
  }
  return response;
}
