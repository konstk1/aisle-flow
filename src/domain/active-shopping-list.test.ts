import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ITEM_COUNT,
  parseShoppingItemImportLines,
} from "./active-shopping-list";

describe("parseShoppingItemImportLines", () => {
  it("splits on line breaks, trims display text, and ignores blank lines", () => {
    const result = parseShoppingItemImportLines(
      "  Milk  \n\nRice\r\n  Broccoli  \r",
    );

    expect(result).toEqual({
      success: true,
      lines: [
        { rawText: "Milk", lineNumber: 1 },
        { rawText: "Rice", lineNumber: 3 },
        { rawText: "Broccoli", lineNumber: 4 },
      ],
    });
  });

  it("rejects all-empty imports", () => {
    const result = parseShoppingItemImportLines("\n  \r\n");

    expect(result).toEqual({
      success: false,
      fieldErrors: { text: ["Paste at least one item, one per line."] },
    });
  });

  it("rejects oversized imports and oversized lines", () => {
    const result = parseShoppingItemImportLines(
      [
        ...Array.from(
          { length: MAX_IMPORT_ITEM_COUNT + 1 },
          (_, index) => `item ${index}`,
        ),
        "x".repeat(121),
      ].join("\n"),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.text).toEqual(
        expect.arrayContaining([
          `Paste ${MAX_IMPORT_ITEM_COUNT} items or fewer at a time.`,
          "Line 52 must be 120 characters or fewer.",
        ]),
      );
    }
  });
});
