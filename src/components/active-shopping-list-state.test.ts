import { describe, expect, it, vi } from "vitest";

import type {
  ActiveShoppingItemPayload,
  ActiveShoppingListPayload,
} from "@/domain/active-shopping-list";

import {
  ADD_PRODUCT_OPTION_VALUE,
  buildProductCorrectionRequest,
  buildProductSelectionPatch,
  createProductCorrectionFormState,
  getStableMutationForText,
  mergeVisibleListSnapshotAfterCheck,
  removeItemFromActiveList,
  replaceItemInActiveList,
  restoreItemInActiveList,
  shouldSaveProductCorrectionForEdit,
} from "./active-shopping-list-state";

describe("getStableMutationForText", () => {
  it("reuses the mutation id for a retry of the same text", () => {
    const createMutationId = vi
      .fn()
      .mockReturnValueOnce("first")
      .mockReturnValueOnce("second");

    const first = getStableMutationForText(null, "Rice", createMutationId);
    const retry = getStableMutationForText(first, "Rice", createMutationId);

    expect(retry).toBe(first);
    expect(retry.mutationId).toBe("first");
    expect(createMutationId).toHaveBeenCalledTimes(1);
  });

  it("creates a new mutation id when the submitted text changes", () => {
    const createMutationId = vi
      .fn()
      .mockReturnValueOnce("first")
      .mockReturnValueOnce("second");

    const first = getStableMutationForText(null, "Rice", createMutationId);
    const changed = getStableMutationForText(
      first,
      "Brown rice",
      createMutationId,
    );

    expect(changed).toEqual({
      text: "Brown rice",
      mutationId: "second",
    });
    expect(createMutationId).toHaveBeenCalledTimes(2);
  });
});

describe("createProductCorrectionFormState", () => {
  it("starts with the matched product selected when an item already has one", () => {
    expect(
      createProductCorrectionFormState({
        productConceptId: "concept-1",
        hasProductConceptOptions: true,
      }),
    ).toMatchObject({
      productSelection: "concept-1",
    });
  });

  it("starts with add product selected when there are no existing products", () => {
    expect(
      createProductCorrectionFormState({
        productConceptId: null,
        hasProductConceptOptions: false,
      }),
    ).toMatchObject({
      productSelection: ADD_PRODUCT_OPTION_VALUE,
    });
  });
});

describe("buildProductSelectionPatch", () => {
  const productConcepts = [
    { id: "concept-1", aisleSectionId: "section-9" },
    { id: "concept-2", aisleSectionId: null },
  ];

  it("fills the section from the selected product's learned location", () => {
    expect(buildProductSelectionPatch("concept-1", productConcepts)).toEqual({
      productSelection: "concept-1",
      canonicalName: "",
      aisleSectionId: "section-9",
    });
  });

  it("leaves the section untouched when the product has no location", () => {
    expect(buildProductSelectionPatch("concept-2", productConcepts)).toEqual({
      productSelection: "concept-2",
      canonicalName: "",
    });
  });

  it("only switches modes for the add-product option", () => {
    expect(
      buildProductSelectionPatch(ADD_PRODUCT_OPTION_VALUE, productConcepts),
    ).toEqual({
      productSelection: ADD_PRODUCT_OPTION_VALUE,
      canonicalName: "",
    });
  });
});

describe("buildProductCorrectionRequest", () => {
  it("builds a correction request for an existing product", () => {
    const result = buildProductCorrectionRequest({
      rawText: "Wild Rice",
      form: {
        productSelection: "22222222-2222-4222-8222-222222222222",
        canonicalName: "",
        aisleSectionId: "33333333-3333-4333-8333-333333333333",
      },
    });

    expect(result).toEqual({
      success: true,
      body: {
        rawText: "Wild Rice",
        productConceptId: "22222222-2222-4222-8222-222222222222",
        aisleSectionId: "33333333-3333-4333-8333-333333333333",
      },
    });
  });

  it("builds a correction request for a new trimmed product", () => {
    const result = buildProductCorrectionRequest({
      rawText: "dried mango",
      form: {
        productSelection: ADD_PRODUCT_OPTION_VALUE,
        canonicalName: "  Dried fruit  ",
        aisleSectionId: "33333333-3333-4333-8333-333333333333",
      },
    });

    expect(result).toEqual({
      success: true,
      body: {
        rawText: "dried mango",
        canonicalName: "Dried fruit",
        aisleSectionId: "33333333-3333-4333-8333-333333333333",
      },
    });
  });

  it("returns field errors before sending incomplete correction data", () => {
    const result = buildProductCorrectionRequest({
      rawText: "Wild Rice",
      form: {
        productSelection: "",
        canonicalName: "",
        aisleSectionId: "",
      },
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        productConceptId: ["Choose a product."],
        aisleSectionId: ["Choose an aisle section."],
      },
    });
  });
});

describe("shouldSaveProductCorrectionForEdit", () => {
  it("does not infer a correction from a pure item rename", () => {
    expect(shouldSaveProductCorrectionForEdit({ locationTouched: false })).toBe(
      false,
    );
  });

  it("saves a correction when the location form was changed", () => {
    expect(shouldSaveProductCorrectionForEdit({ locationTouched: true })).toBe(
      true,
    );
  });
});

describe("mergeVisibleListSnapshotAfterCheck", () => {
  it("keeps other in-flight checkbox changes hidden when a server snapshot returns", () => {
    const serverSnapshot = listWithItems([
      itemWithState("item-a", false),
      itemWithState("item-b", false),
      itemWithState("item-c", false),
    ]);

    const merged = mergeVisibleListSnapshotAfterCheck({
      completedCheckItemId: "item-a",
      nextList: serverSnapshot,
      pendingCheckItemIds: new Set(["item-a", "item-b"]),
    });

    expect(merged.items.map((item) => [item.id, item.isChecked])).toEqual([
      ["item-a", false],
      ["item-c", false],
    ]);
  });
});

describe("replaceItemInActiveList", () => {
  it("restores only the requested item", () => {
    const list = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-b", true),
    ]);

    const restored = replaceItemInActiveList(
      list,
      itemWithState("item-a", false),
    );

    expect(restored?.items.map((item) => [item.id, item.isChecked])).toEqual([
      ["item-a", false],
      ["item-b", true],
    ]);
  });
});

describe("removeItemFromActiveList", () => {
  it("removes a pending item from the visible list", () => {
    const list = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-b", true),
    ]);

    const updated = removeItemFromActiveList(list, "item-a");

    expect(updated?.items.map((item) => item.id)).toEqual(["item-b"]);
  });
});

describe("restoreItemInActiveList", () => {
  it("inserts a removed item back at the previous visible index", () => {
    const list = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-c", true),
    ]);

    const restored = restoreItemInActiveList(
      list,
      itemWithState("item-b", true),
      1,
    );

    expect(restored?.items.map((item) => item.id)).toEqual([
      "item-a",
      "item-b",
      "item-c",
    ]);
  });

  it("replaces an existing item instead of duplicating it", () => {
    const list = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-b", true),
    ]);

    const restored = restoreItemInActiveList(
      list,
      itemWithState("item-a", false),
      0,
    );

    expect(restored?.items.map((item) => [item.id, item.isChecked])).toEqual([
      ["item-a", false],
      ["item-b", true],
    ]);
  });
});

function listWithItems(
  items: ActiveShoppingItemPayload[],
): ActiveShoppingListPayload {
  return {
    store: {
      id: "store-1",
      name: "Example Market",
    },
    list: {
      id: "list-1",
      source: "manual",
    },
    items,
  };
}

function itemWithState(
  id: string,
  isChecked: boolean,
): ActiveShoppingItemPayload {
  return {
    id,
    rawText: id,
    normalizedText: id,
    isChecked,
    checkedAt: isChecked ? "2026-01-01T00:00:00.000Z" : null,
    snoozedUntil: null,
    resolutionState: "needs-correction",
    productConcept: null,
    location: null,
  };
}
