import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";

const PUBLIC_AUTH_PATHS = [
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/backchannel-logout",
  "/api/auth/logout",
];

function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

const STATIC_ASSET_REGEX =
  /\.(?:png|jpg|jpeg|gif|webp|svg|ico|m4a|mp3|wav|ogg|css|js|map|json|txt|woff|woff2|ttf|eot)$/i;

function isAssetOrApiPath(pathname: string, request: NextRequest): boolean {
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/audio/")) return true;
  if (STATIC_ASSET_REGEX.test(pathname)) return true;

  const secFetchDest = request.headers.get("sec-fetch-dest");
  if (
    secFetchDest &&
    ["image", "audio", "video", "font", "script", "style"].includes(secFetchDest)
  ) {
    return true;
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public auth flow endpoints
  if (isPublicAuthPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Check and verify casino_session cookie
  const sessionToken = request.cookies.get("casino_session")?.value;
  const session = sessionToken ? await verifySession(sessionToken) : null;

  if (session) {
    return NextResponse.next();
  }

  // 3. User is unauthenticated:
  // For static assets, media, and API calls, return 401 Unauthorized
  if (isAssetOrApiPath(pathname, request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  // For pages, subpages, and document navigations, force login redirect
  const loginUrl = new URL("/api/auth/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all requests across pages, subpages, APIs, and assets.
     */
    "/(.*)",
  ],
};
