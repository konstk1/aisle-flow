import { describe, expect, it } from "vitest";
import type { ActiveShoppingItemPayload } from "@/domain/active-shopping-list";
import { groupCompletedItemsByDay } from "./completed-item-groups";

function item(id: string, checkedAt: string) {
  return { id, checkedAt } as ActiveShoppingItemPayload;
}

describe("completed items grouped by calendar day", () => {
  it("groups by the viewer's day across UTC midnight, newest days first", () => {
    const groups = groupCompletedItemsByDay(
      [
        item("a", "2026-09-30T13:00:00Z"),
        item("b", "2026-09-30T01:00:00Z"),
        item("c", "2026-09-29T23:00:00Z"),
      ],
      "America/New_York",
    );
    expect(
      groups.map((group) => [group.id, group.items.map((row) => row.id)]),
    ).toEqual([
      ["2026-09-30", ["a"]],
      ["2026-09-29", ["b", "c"]],
    ]);
    expect(groups[1]!.label).toContain("September 29, 2026");
  });

  it("keeps both occurrences of the repeated DST hour in the same day", () => {
    const groups = groupCompletedItemsByDay(
      [item("a", "2026-11-01T06:30:00Z"), item("b", "2026-11-01T05:30:00Z")],
      "America/New_York",
    );
    expect(groups.map((group) => group.id)).toEqual(["2026-11-01"]);
    expect(groups[0]!.items.map((row) => row.id)).toEqual(["a", "b"]);
  });
});
