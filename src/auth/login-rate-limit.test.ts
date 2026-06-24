import { describe, expect, it } from "vitest";

import { createLoginRateLimiter } from "./login-rate-limit";

describe("login rate limiting", () => {
  it("throttles repeated failures and permits attempts after the window", () => {
    let currentTime = 1_000;
    const limiter = createLoginRateLimiter(() => currentTime);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.check("client")).toEqual({ allowed: true });
      limiter.recordFailure("client");
    }

    expect(limiter.check("client")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    currentTime += 60_000;

    expect(limiter.check("client")).toEqual({ allowed: true });
  });

  it("clears failures after a successful login", () => {
    const limiter = createLoginRateLimiter();

    limiter.recordFailure("client");
    limiter.reset("client");

    expect(limiter.check("client")).toEqual({ allowed: true });
  });
});
