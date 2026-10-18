import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/auth/callback", "/icon.svg"];
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
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  if (!user && !isPublic) { const login = request.nextUrl.clone(); login.pathname = "/login"; login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search); return NextResponse.redirect(login); }
  if (user && request.nextUrl.pathname === "/login") { const home = request.nextUrl.clone(); home.pathname = "/"; home.search = ""; return NextResponse.redirect(home); }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
