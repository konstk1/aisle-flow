import type { ActiveShoppingItemPayload } from "@/domain/active-shopping-list";

export function groupCompletedItemsByDay(
  items: readonly ActiveShoppingItemPayload[],
  timeZone: string,
) {
  const keyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const labelFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
  });
  const groups = new Map<
    string,
    { id: string; label: string; items: ActiveShoppingItemPayload[] }
  >();

  for (const item of items) {
    const date = item.checkedAt ? new Date(item.checkedAt) : null;
    const validDate = date && !Number.isNaN(date.getTime());
    const parts = validDate ? keyFormatter.formatToParts(date) : [];
    const id = validDate
      ? ["year", "month", "day"]
          .map((type) => parts.find((part) => part.type === type)?.value)
          .join("-")
      : "unknown";
    const existing = groups.get(id);
    if (existing) existing.items.push(item);
    else {
      groups.set(id, {
        id,
        label: validDate
          ? labelFormatter.format(date)
          : "Completion date unavailable",
        items: [item],
      });
    }
  }

  // ISO calendar keys sort newest days first; retain the server's completion
  // order within each day. Unknown dates come last.
  return [...groups.values()].sort((a, b) => {
    if (a.id === "unknown") return 1;
    if (b.id === "unknown") return -1;
    return b.id.localeCompare(a.id);
  });
}
