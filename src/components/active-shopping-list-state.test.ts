import { describe, expect, it, vi } from "vitest";

import type {
  ActiveShoppingItemPayload,
  ActiveShoppingListPayload,
} from "@/domain/active-shopping-list";

import {
  getStableMutationForText,
  mergeActiveListSnapshotAfterCheck,
  replaceItemInActiveList,
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

describe("mergeActiveListSnapshotAfterCheck", () => {
  it("keeps other in-flight checkbox changes when a server snapshot returns", () => {
    const currentList = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-b", true),
    ]);
    const serverSnapshot = listWithItems([
      itemWithState("item-a", true),
      itemWithState("item-b", false),
    ]);

    const merged = mergeActiveListSnapshotAfterCheck({
      completedCheckItemId: "item-a",
      currentList,
      nextList: serverSnapshot,
      pendingCheckItemIds: new Set(["item-a", "item-b"]),
    });

    expect(merged.items.map((item) => [item.id, item.isChecked])).toEqual([
      ["item-a", true],
      ["item-b", true],
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
      syncState: "synced",
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
    syncState: "synced",
    resolutionState: "needs-correction",
    productConcept: null,
    location: null,
  };
}
