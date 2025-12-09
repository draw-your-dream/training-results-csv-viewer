import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SERVER_PREFIX = "/server-data";

export function middleware(request: NextRequest) {
  const pathname = normalizePathname(request.nextUrl.pathname);
  if (!pathname.startsWith(SERVER_PREFIX)) {
    return NextResponse.next();
  }

  if (!isDocumentRequest(request)) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = "/";
  rewriteUrl.searchParams.set("virtual", ensureLeadingSlash(pathname));
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ["/server-data/:path*"],
};

function isDocumentRequest(request: NextRequest): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  // collapse duplicate slashes to align with router expectations
  return pathname.replace(/\/+/g, "/");
}

function ensureLeadingSlash(pathname: string): string {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
