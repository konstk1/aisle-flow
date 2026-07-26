import { describe, expect, it } from "vitest";

import { isForeignKeyError, isUniqueConstraintError } from "./errors";

describe("database error classifiers", () => {
  it("recognizes direct database errors", () => {
    expect(isUniqueConstraintError({ code: "23505" })).toBe(true);
    expect(isForeignKeyError({ code: "23503" })).toBe(true);
  });

  it("recognizes database errors wrapped by the query layer", () => {
    expect(
      isUniqueConstraintError({
        cause: { code: "23505" },
        message: "Failed query",
      }),
    ).toBe(true);
    expect(
      isForeignKeyError({
        cause: { cause: { code: "23503" } },
        message: "Failed query",
      }),
    ).toBe(true);
  });

  it("stops safely when an error cause is cyclic", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;

    expect(isUniqueConstraintError(error)).toBe(false);
  });
});
