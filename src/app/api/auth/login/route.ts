import { NextResponse } from "next/server";

import { getLoginClientId, loginRateLimiter } from "@/auth/login-rate-limit";
import { verifyAppPassword } from "@/auth/password";
import { getSafeRedirectPath } from "@/auth/redirect";
import {
  createSession,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/auth/session";

const GENERIC_FAILURE_MESSAGE =
  "Unable to sign in. Check your password and try again.";

function acceptsHtml(request: Request) {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function failedLoginResponse(
  request: Request,
  status: 401 | 429,
  retryAfterSeconds?: number,
) {
  const throttled = status === 429;
  const message = throttled
    ? "Too many sign-in attempts. Try again shortly."
    : GENERIC_FAILURE_MESSAGE;

  if (acceptsHtml(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", throttled ? "throttled" : "invalid");
    return NextResponse.redirect(url, 303);
  }

  return NextResponse.json(
    { error: message },
    {
      headers: retryAfterSeconds
        ? { "Retry-After": retryAfterSeconds.toString() }
        : undefined,
      status,
    },
  );
}

export async function POST(request: Request) {
  const clientId = getLoginClientId(request);
  const rateLimit = loginRateLimiter.check(clientId);

  if (!rateLimit.allowed) {
    return failedLoginResponse(request, 429, rateLimit.retryAfterSeconds);
  }

  const formData = await request.formData();
  const passwordIsValid = await verifyAppPassword(formData.get("password"));

  if (!passwordIsValid) {
    loginRateLimiter.recordFailure(clientId);
    return failedLoginResponse(request, 401);
  }

  loginRateLimiter.reset(clientId);

  const response = NextResponse.redirect(
    new URL(getSafeRedirectPath(formData.get("next")), request.url),
    303,
  );
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await createSession(),
    getSessionCookieOptions(),
  );

  return response;
}
