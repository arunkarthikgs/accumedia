import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.AUTH_REQUIRED !== "true") return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/auth") || request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/_next")) {
    return NextResponse.next();
  }
  if (!request.cookies.get("macula_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};