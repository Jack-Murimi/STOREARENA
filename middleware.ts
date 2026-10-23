import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/no-access", "/auth/callback", "/auth/set-password", "/icon.svg"];
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Fail closed. Serving protected pages when Auth configuration is absent
  // turns a deployment mistake into a data-exposure incident.
  if (!url || !key) {
    return new NextResponse("Portal authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const path = request.nextUrl.pathname;
  const isPublic = publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`));
  // Password callbacks exchange their own token in the browser; don't add an
  // Auth network request before rendering that public handoff page.
  if (isPublic && path !== "/login") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  // getClaims verifies asymmetric JWTs locally with a cached JWKS; getUser
  // performs an Auth network request on every protected page navigation.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims && !isPublic) { const login = request.nextUrl.clone(); login.pathname = "/login"; login.searchParams.set("next", path + request.nextUrl.search); return NextResponse.redirect(login); }
  if (claims && path === "/login") { const home = request.nextUrl.clone(); home.pathname = "/"; home.search = ""; return NextResponse.redirect(home); }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
