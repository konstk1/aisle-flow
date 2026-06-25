import type {
  ActiveShoppingListPayload,
  ActiveShoppingItemPayload,
} from "@/domain/active-shopping-list";

export type PendingTextMutation = {
  text: string;
  mutationId: string;
};

export function getStableMutationForText(
  current: PendingTextMutation | null,
  text: string,
  createMutationId: () => string,
): PendingTextMutation {
  if (current?.text === text) {
    return current;
  }

  return {
    text,
    mutationId: createMutationId(),
  };
}

export function mergeActiveListSnapshotAfterCheck({
  completedCheckItemId,
  currentList,
  nextList,
  pendingCheckItemIds,
}: {
  completedCheckItemId: string;
  currentList: ActiveShoppingListPayload | null;
  nextList: ActiveShoppingListPayload;
  pendingCheckItemIds: ReadonlySet<string>;
}): ActiveShoppingListPayload {
  const preservedPendingItemIds = new Set(pendingCheckItemIds);
  preservedPendingItemIds.delete(completedCheckItemId);

  if (!currentList || preservedPendingItemIds.size === 0) {
    return nextList;
  }

  const currentItemsById = new Map(
    currentList.items.map((item) => [item.id, item]),
  );

  return {
    ...nextList,
    items: nextList.items.map((item) =>
      preservedPendingItemIds.has(item.id)
        ? (currentItemsById.get(item.id) ?? item)
        : item,
    ),
  };
}

export function replaceItemInActiveList(
  currentList: ActiveShoppingListPayload | null,
  replacementItem: ActiveShoppingItemPayload,
): ActiveShoppingListPayload | null {
  if (!currentList) {
    return currentList;
  }

  return {
    ...currentList,
    items: currentList.items.map((item) =>
      item.id === replacementItem.id ? replacementItem : item,
    ),
  };
}
