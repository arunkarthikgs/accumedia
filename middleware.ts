import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authRequired = process.env.AUTH_REQUIRED !== "false";
  if (!authRequired) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/auth") || request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/_next")) {
    return NextResponse.next();
  }
  if (!request.cookies.get("macula_session")) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized: active session required." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};