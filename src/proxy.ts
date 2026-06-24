import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/auth/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionIsValid = await verifySession(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && sessionIsValid) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (sessionIsValid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
