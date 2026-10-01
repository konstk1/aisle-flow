import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ActiveShoppingListPayload } from "@/domain/active-shopping-list";
import {
  ActiveShoppingList,
  CompletedShoppingList,
  SnoozedShoppingList,
} from "./active-shopping-list";

const list: ActiveShoppingListPayload = {
  store: { id: "store", name: "Store" },
  list: { id: "list", source: "manual" },
  items: [
    {
      id: "checked-item",
      rawText: "Retained checked item",
      normalizedText: "retained checked item",
      quantityText: null,
      isChecked: true,
      checkedAt: "2026-09-30T01:00:00Z",
      snoozedUntil: null,
      resolutionState: "needs-correction",
      productConcept: null,
      categorization: {
        source: null,
        reviewState: "none",
        suggestedConceptName: null,
      },
      location: null,
    },
  ],
};

describe("shopping list initial server render", () => {
  it("waits for the browser cutoff before showing retained checked rows", () => {
    const html = renderToString(
      createElement(ActiveShoppingList, {
        hasStoreRoute: true,
        initialActiveList: list,
      }),
    );
    expect(html).toContain("Loading items…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Retained checked item");
    expect(html).not.toContain("No items yet.");
  });

  it("waits for the browser timezone before showing completed day groups", () => {
    const html = renderToString(
      createElement(CompletedShoppingList, {
        hasStoreRoute: true,
        initialCompletedList: list,
      }),
    );
    expect(html).toContain("Loading items…");
    expect(html).not.toContain("Retained checked item");
    expect(html).not.toContain("September 30, 2026");
    expect(html).not.toContain("September 29, 2026");
  });

  it("still server-renders snoozed items that need no browser-only filtering", () => {
    const html = renderToString(
      createElement(SnoozedShoppingList, {
        hasStoreRoute: true,
        initialSnoozedList: {
          ...list,
          items: [{ ...list.items[0]!, isChecked: false, checkedAt: null }],
        },
      }),
    );
    expect(html).toContain("Retained checked item");
    expect(html).not.toContain("Loading items…");
  });
});
