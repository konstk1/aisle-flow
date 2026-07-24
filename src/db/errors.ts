export function isForeignKeyError(error: unknown) {
  return databaseErrorHasCode(error, "23503");
}

export function isUniqueConstraintError(error: unknown) {
  return databaseErrorHasCode(error, "23505");
}

function databaseErrorHasCode(error: unknown, code: string) {
  const seen = new Set<object>();
  let current = error;

  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);

    if ("code" in current && current.code === code) {
      return true;
    }

    current = "cause" in current ? current.cause : null;
  }

  return false;
}
