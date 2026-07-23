import { describe, expect, it } from "vitest";

import { defaultCopyName } from "./copy-store-dialog";

describe("defaultCopyName", () => {
  it("does not split an emoji at the store-name limit", () => {
    const name = defaultCopyName(`${"a".repeat(74)}🛒 trailing text`);

    expect(name).toBe(`${"a".repeat(74)} copy`);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name).not.toContain("�");
  });

  it("keeps a complete emoji when it fits before the suffix", () => {
    const name = defaultCopyName(`${"a".repeat(73)}🛒`);

    expect(name).toBe(`${"a".repeat(73)}🛒 copy`);
    expect(name.length).toBe(80);
  });
});
