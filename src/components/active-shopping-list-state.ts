import type {
  ActiveShoppingListPayload,
  ActiveShoppingItemPayload,
  FieldErrors,
} from "@/domain/active-shopping-list";

export type PendingTextMutation = {
  text: string;
  mutationId: string;
};

export const ADD_PRODUCT_OPTION_VALUE = "__add_product__";

// Distinct from ADD_PRODUCT_OPTION_VALUE so choosing it always fires a change
// event, even while a pending new product is the current selection.
export const NEW_PRODUCT_DIALOG_OPTION_VALUE = "__new_product_dialog__";

export type ProductCorrectionFormState = {
  productSelection: string;
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

export function shouldSaveProductCorrectionForEdit({
  locationTouched,
}: {
  locationTouched: boolean;
}): boolean {
  return locationTouched;
}

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
    productSelection:
      productConceptId ??
      (hasProductConceptOptions ? "" : ADD_PRODUCT_OPTION_VALUE),
    canonicalName: "",
    aisleSectionId: "",
  };
}

export type ProductConceptOption = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  aisleSectionId: string | null;
};

// After a correction is saved, refresh the concept's location in the cached
// options so later edits compare against the new section, not the stale one.
export function applyCorrectedConceptLocation(
  productConcepts: readonly ProductConceptOption[],
  corrected: ProductConceptOption,
): ProductConceptOption[] {
  if (productConcepts.some((concept) => concept.id === corrected.id)) {
    return productConcepts.map((concept) =>
      concept.id === corrected.id
        ? { ...concept, aisleSectionId: corrected.aisleSectionId }
        : concept,
    );
  }

  return [...productConcepts, corrected].sort((first, second) =>
    first.normalizedName.localeCompare(second.normalizedName),
  );
}

// Shared derivations for the product select in both correction editors: which
// mode it's in, whether the current selection is a concept no longer offered,
// and the bound value (blank while a new product has no name yet).
export function getProductSelectionState(
  form: ProductCorrectionFormState,
  productConcepts: readonly { id: string }[],
) {
  const isAddingProduct = form.productSelection === ADD_PRODUCT_OPTION_VALUE;

  return {
    isAddingProduct,
    selectedConceptIsMissing:
      form.productSelection.length > 0 &&
      !isAddingProduct &&
      !productConcepts.some((concept) => concept.id === form.productSelection),
    selectValue:
      isAddingProduct && !form.canonicalName ? "" : form.productSelection,
  };
}

export function buildProductSelectionPatch(
  productSelection: string,
  productConcepts: readonly { id: string; aisleSectionId: string | null }[],
): Partial<ProductCorrectionFormState> {
  const selected = productConcepts.find(
    (concept) => concept.id === productSelection,
  );

  return {
    productSelection,
    canonicalName: "",
    ...(selected?.aisleSectionId
      ? { aisleSectionId: selected.aisleSectionId }
      : {}),
  };
}

export type LocationChangeWarning = {
  productName: string;
  affectedItemTexts: string[];
};

// A correction to an existing product with a different section moves the
// product's one location per store, relocating every linked item at once.
export function getLocationChangeWarning({
  body,
  productConcepts,
  items,
  excludeItemId,
}: {
  body: ProductCorrectionRequestBody;
  productConcepts: readonly {
    id: string;
    canonicalName: string;
    aisleSectionId: string | null;
  }[];
  items: readonly {
    id: string;
    rawText: string;
    isChecked: boolean;
    productConcept: { id: string } | null;
  }[];
  excludeItemId?: string;
}): LocationChangeWarning | null {
  if (!body.productConceptId) {
    return null;
  }

  const concept = productConcepts.find(
    (candidate) => candidate.id === body.productConceptId,
  );

  if (
    !concept ||
    concept.aisleSectionId === null ||
    concept.aisleSectionId === body.aisleSectionId
  ) {
    return null;
  }

  return {
    productName: concept.canonicalName,
    affectedItemTexts: items
      .filter(
        (item) =>
          !item.isChecked &&
          item.id !== excludeItemId &&
          item.productConcept?.id === body.productConceptId,
      )
      .map((item) => item.rawText),
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
  const productSelection = form.productSelection.trim();

  if (productSelection === ADD_PRODUCT_OPTION_VALUE) {
    const canonicalName = form.canonicalName.trim();

    if (!canonicalName) {
      fieldErrors.canonicalName = ["Enter a product name."];
    }
  } else {
    if (!productSelection) {
      fieldErrors.productConceptId = ["Choose a product."];
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
      ...(productSelection === ADD_PRODUCT_OPTION_VALUE
        ? { canonicalName: form.canonicalName.trim() }
        : { productConceptId: productSelection }),
    },
  };
}

export function mergeVisibleListSnapshotAfterCheck({
  completedCheckItemId,
  nextList,
  pendingCheckItemIds,
}: {
  completedCheckItemId: string;
  nextList: ActiveShoppingListPayload;
  pendingCheckItemIds: ReadonlySet<string>;
}): ActiveShoppingListPayload {
  const hiddenPendingItemIds = new Set(pendingCheckItemIds);
  hiddenPendingItemIds.delete(completedCheckItemId);

  if (hiddenPendingItemIds.size === 0) {
    return nextList;
  }

  return {
    ...nextList,
    items: nextList.items.filter((item) => !hiddenPendingItemIds.has(item.id)),
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

export function removeItemFromActiveList(
  currentList: ActiveShoppingListPayload | null,
  itemId: string,
): ActiveShoppingListPayload | null {
  if (!currentList) {
    return currentList;
  }

  return {
    ...currentList,
    items: currentList.items.filter((item) => item.id !== itemId),
  };
}

export function restoreItemInActiveList(
  currentList: ActiveShoppingListPayload | null,
  restoredItem: ActiveShoppingItemPayload,
  restoredIndex: number,
): ActiveShoppingListPayload | null {
  if (!currentList) {
    return currentList;
  }

  if (currentList.items.some((item) => item.id === restoredItem.id)) {
    return replaceItemInActiveList(currentList, restoredItem);
  }

  const nextItems = [...currentList.items];
  const boundedIndex = Math.max(0, Math.min(restoredIndex, nextItems.length));
  nextItems.splice(boundedIndex, 0, restoredItem);

  return {
    ...currentList,
    items: nextItems,
  };
}
