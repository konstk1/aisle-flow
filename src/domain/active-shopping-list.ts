import { normalizeProductText } from "./product-matching";

export const MAX_SHOPPING_ITEM_TEXT_LENGTH = 120;
export const MAX_IMPORT_ITEM_COUNT = 50;

// Checked items stay on the active list (struck through) for this long so a
// mid-trip list keeps tallying what's already in the cart; only afterwards do
// they surface in the completed view.
export const CHECKED_ITEM_RETENTION_MS = 4 * 60 * 60 * 1000;

export function checkedItemRetentionCutoff(now: Date) {
  return new Date(now.getTime() - CHECKED_ITEM_RETENTION_MS);
}

export type FieldErrors = Record<string, string[]>;

export interface ParsedShoppingItemLine {
  rawText: string;
  lineNumber: number;
}

export type ShoppingItemImportParseResult =
  | { success: true; lines: ParsedShoppingItemLine[] }
  | { success: false; fieldErrors: FieldErrors };

export interface ActiveShoppingListPayload {
  store: {
    id: string;
    name: string;
  } | null;
  list: {
    id: string;
    source: "manual" | "import" | "provider";
  };
  items: ActiveShoppingItemPayload[];
}

export interface ActiveShoppingItemPayload {
  id: string;
  rawText: string;
  normalizedText: string;
  isChecked: boolean;
  checkedAt: string | null;
  snoozedUntil: string | null;
  resolutionState: "route-resolved" | "matched-unlocated" | "needs-correction";
  productConcept: {
    id: string;
    canonicalName: string;
    normalizedName: string;
  } | null;
  location: {
    id: string;
    aisleSectionId: string;
    positionWithinSection: number | null;
    confidence: number;
    source: "curated" | "manual" | "inferred" | "imported";
    aisleSection: {
      id: string;
      aisleId: string;
      aisleIdentifier: string;
      aisleDisplayName: string | null;
      label: string | null;
      pathOrder: number;
      side: "left" | "right" | "center" | "endcap";
    };
  } | null;
}

export function parseShoppingItemImportLines(
  text: string,
): ShoppingItemImportParseResult {
  const lines = text
    .split(/\r\n|\n|\r/u)
    .map((line, index) => ({
      rawText: line.trim(),
      lineNumber: index + 1,
    }))
    .filter((line) => line.rawText.length > 0);
  const fieldErrors: FieldErrors = {};

  if (lines.length === 0) {
    fieldErrors.text = ["Paste at least one item, one per line."];
  }

  if (lines.length > MAX_IMPORT_ITEM_COUNT) {
    fieldErrors.text ??= [];
    fieldErrors.text.push(
      `Paste ${MAX_IMPORT_ITEM_COUNT} items or fewer at a time.`,
    );
  }

  for (const line of lines) {
    if (line.rawText.length > MAX_SHOPPING_ITEM_TEXT_LENGTH) {
      fieldErrors.text ??= [];
      fieldErrors.text.push(
        `Line ${line.lineNumber} must be ${MAX_SHOPPING_ITEM_TEXT_LENGTH} characters or fewer.`,
      );
    }

    if (normalizeProductText(line.rawText).length === 0) {
      fieldErrors.text ??= [];
      fieldErrors.text.push(
        `Line ${line.lineNumber} needs letters or numbers.`,
      );
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return { success: true, lines };
}
