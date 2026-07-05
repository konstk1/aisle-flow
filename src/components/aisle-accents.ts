export const AISLE_ACCENT_COLORS = [
  "#34c759",
  "#0a84ff",
  "#ff9f0a",
  "#af52de",
  "#5e5ce6",
  "#ff2d55",
  "#30b0c7",
  "#ff9500",
];

export function colorForKey(key: string) {
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return AISLE_ACCENT_COLORS[hash % AISLE_ACCENT_COLORS.length];
}

// Matches the group key produced by shoppingItemAisleGroup so an aisle gets
// the same accent color on the shopping list and the route editor.
export function aisleAccentColor(aisleId: string) {
  return colorForKey(`aisle-${aisleId}`);
}
