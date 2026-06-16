import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES  = ["/login", "/register", "/"];
const AUTH_ROUTES    = ["/login", "/register"];
const DRIVER_ROUTES  = ["/driver-dashboard"];
const ADMIN_ROUTES   = ["/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("atoz_access_token")?.value;

  const isPublic  = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  const isAuth    = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  // Redirect authenticated users away from login/register
  if (isAuth && token) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  // Redirect unauthenticated users to login
  if (!isPublic && !token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)",
  ],
};
