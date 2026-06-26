import type {
  ActiveShoppingListPayload,
  ActiveShoppingItemPayload,
  FieldErrors,
} from "@/domain/active-shopping-list";

export type PendingTextMutation = {
  text: string;
  mutationId: string;
};

export const ADD_CATEGORY_OPTION_VALUE = "__add_category__";

export type ProductCorrectionFormState = {
  categorySelection: string;
  canonicalName: string;
  aisleSectionId: string;
};

export type ProductCorrectionRequestBody = {
  rawText: string;
  aisleSectionId: string;
  productConceptId?: string;
  canonicalName?: string;
};

export type ProductCorrectionRequestBuildResult =
  | { success: true; body: ProductCorrectionRequestBody }
  | { success: false; fieldErrors: FieldErrors };

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

export function createProductCorrectionFormState({
  productConceptId,
  hasProductConceptOptions,
}: {
  productConceptId: string | null;
  hasProductConceptOptions: boolean;
}): ProductCorrectionFormState {
  return {
    categorySelection:
      productConceptId ??
      (hasProductConceptOptions ? "" : ADD_CATEGORY_OPTION_VALUE),
    canonicalName: "",
    aisleSectionId: "",
  };
}

export function buildProductCorrectionRequest({
  form,
  rawText,
}: {
  form: ProductCorrectionFormState;
  rawText: string;
}): ProductCorrectionRequestBuildResult {
  const fieldErrors: FieldErrors = {};
  const aisleSectionId = form.aisleSectionId.trim();
  const categorySelection = form.categorySelection.trim();

  if (categorySelection === ADD_CATEGORY_OPTION_VALUE) {
    const canonicalName = form.canonicalName.trim();

    if (!canonicalName) {
      fieldErrors.canonicalName = ["Enter a shelf category name."];
    }
  } else {
    if (!categorySelection) {
      fieldErrors.productConceptId = ["Choose a shelf category."];
    }
  }

  if (!aisleSectionId) {
    fieldErrors.aisleSectionId = ["Choose an aisle section."];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    body: {
      rawText,
      aisleSectionId,
      ...(categorySelection === ADD_CATEGORY_OPTION_VALUE
        ? { canonicalName: form.canonicalName.trim() }
        : { productConceptId: categorySelection }),
    },
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
