const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

type AttemptBucket = {
  attempts: number;
  startedAt: number;
};

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type LoginRateLimiter = {
  check(clientId: string): RateLimitResult;
  recordFailure(clientId: string): void;
  reset(clientId: string): void;
};

export function createLoginRateLimiter(
  now: () => number = () => Date.now(),
): LoginRateLimiter {
  const attempts = new Map<string, AttemptBucket>();

  function removeExpiredAttempts() {
    const currentTime = now();

    for (const [clientId, bucket] of attempts) {
      if (bucket.startedAt + WINDOW_MS <= currentTime) {
        attempts.delete(clientId);
      }
    }
  }

  return {
    check(clientId) {
      removeExpiredAttempts();

      const bucket = attempts.get(clientId);
      if (!bucket || bucket.attempts < MAX_ATTEMPTS) {
        return { allowed: true };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.startedAt + WINDOW_MS - now()) / 1_000),
        ),
      };
    },
    recordFailure(clientId) {
      removeExpiredAttempts();

      const bucket = attempts.get(clientId);
      if (bucket) {
        bucket.attempts += 1;
        return;
      }

      attempts.set(clientId, { attempts: 1, startedAt: now() });
    },
    reset(clientId) {
      attempts.delete(clientId);
    },
  };
}

export const loginRateLimiter = createLoginRateLimiter();

export function getLoginClientId(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}
