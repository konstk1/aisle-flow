import { NextResponse } from "next/server";

import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/auth/session";

function acceptsHtml(request: Request) {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

export async function POST(request: Request) {
  const response = acceptsHtml(request)
    ? NextResponse.redirect(new URL("/login", request.url), 303)
    : new NextResponse(null, { status: 204 });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
