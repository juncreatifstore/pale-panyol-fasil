import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const isAdminPage = request.nextUrl.pathname.startsWith("/admin");
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isAdminApi = request.nextUrl.pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) return response;
  if (error || !data?.claims?.sub) {
    if (isAdminApi) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isLoginPage) return NextResponse.redirect(new URL("/admin/login", request.url));
    return response;
  }

  const { data: admin } = await supabase.from("admin_users").select("user_id,is_active").eq("user_id", data.claims.sub).eq("is_active", true).maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    if (isAdminApi) return NextResponse.json({ error: "Accès administrateur refusé" }, { status: 403 });
    if (!isLoginPage) return NextResponse.redirect(new URL("/admin/login?error=access", request.url));
    return response;
  }

  if (isLoginPage) return NextResponse.redirect(new URL("/admin", request.url));
  return response;
}
