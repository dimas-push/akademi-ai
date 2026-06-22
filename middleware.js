import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/_next", "/favicon", "/manifest.json", "/icon", "/sw.js", "/api/cron"];

// Edge Runtime — pakai Web Crypto API (tidak ada Node.js crypto)
async function deriveToken(pass) {
  const data   = new TextEncoder().encode(pass + ':akademi-auth-v1');
  const hash   = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname.includes(".")) {
    return NextResponse.next();
  }

  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) return NextResponse.next();

  const token    = request.cookies.get("akademi-auth")?.value;
  const expected = await deriveToken(secret);

  if (token !== expected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
