import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/_next", "/favicon", "/manifest.json", "/icon", "/sw.js"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Lewati path publik dan static assets
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.includes(".")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("akademi-auth")?.value;
  const secret = process.env.DASHBOARD_PASSWORD;

  // Jika tidak ada password dikonfigurasi, izinkan semua
  if (!secret) return NextResponse.next();

  if (token !== secret) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
