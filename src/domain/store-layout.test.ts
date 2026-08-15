import { describe, expect, it } from "vitest";

import {
  getNextAisleIdentifier,
  getRouteSections,
  moveSectionToTarget,
  renumberPathOrders,
  type StoreLayout,
} from "./store-layout";

const layout: StoreLayout = {
  id: "store",
  name: "Example Market",
  aisles: [
    {
      id: "aisle-2",
      identifier: "2",
      displayName: null,
      displayOrder: 1,
      sections: [
        {
          id: "dairy",
          label: "Dairy",
          pathOrder: 2,
          side: "left",
        },
      ],
    },
    {
      id: "aisle-1",
      identifier: "1",
      displayName: null,
      displayOrder: 0,
      sections: [
        {
          id: "produce-start",
          label: "Produce start",
          pathOrder: 0,
          side: "left",
        },
        {
          id: "produce-end",
          label: "Produce end",
          pathOrder: 1,
          side: "right",
        },
      ],
    },
  ],
};

describe("getRouteSections", () => {
  it("uses the persisted aisle display order when renumbering paths", () => {
    const reordered = renumberPathOrders([...layout.aisles].reverse());

    expect(reordered.map((aisle) => aisle.identifier)).toEqual(["1", "2"]);
    expect(
      reordered.flatMap((aisle) =>
        aisle.sections.map((section) => section.pathOrder),
      ),
    ).toEqual([0, 1, 2]);
  });

  it("creates a unique numeric aisle identifier after a middle aisle is deleted", () => {
    const aisles = ["1", "3"].map((identifier, displayOrder) => ({
      ...layout.aisles[0],
      id: `${identifier}-aisle`,
      identifier,
      displayOrder,
    }));

    expect(getNextAisleIdentifier(aisles)).toBe("4");
  });

  it("uses one absolute path order across all aisles", () => {
    expect(
      getRouteSections(layout).map(({ section }) => section.label),
    ).toEqual(["Produce start", "Produce end", "Dairy"]);
  });

  it("does not use side to determine the route", () => {
    const route = getRouteSections({
      ...layout,
      aisles: layout.aisles.map((aisle) => ({
        ...aisle,
        sections: aisle.sections.map((section) => ({
          ...section,
          side: "endcap",
        })),
      })),
    });

    expect(route.map(({ section }) => section.id)).toEqual([
      "produce-start",
      "produce-end",
      "dairy",
    ]);
  });

  it("assigns contiguous absolute paths after a section is moved, inserted, or deleted", () => {
    const renumbered = renumberPathOrders([
      {
        ...layout.aisles[1],
        sections: [layout.aisles[1].sections[1], layout.aisles[1].sections[0]],
      },
      {
        ...layout.aisles[0],
        sections: [
          {
            ...layout.aisles[0].sections[0],
            id: "bakery",
            pathOrder: 99,
          },
          layout.aisles[0].sections[0],
        ],
      },
    ]);

    expect(
      renumbered.flatMap((aisle) =>
        aisle.sections.map((section) => [section.id, section.pathOrder]),
      ),
    ).toEqual([
      ["produce-end", 0],
      ["produce-start", 1],
      ["bakery", 2],
      ["dairy", 3],
    ]);
  });
});

describe("moveSectionToTarget", () => {
  it("moves a section between aisles without changing its identity", () => {
    const moved = moveSectionToTarget(layout.aisles, "produce-end", "dairy");

    expect(moved[0].sections.map(({ id }) => id)).toEqual(["produce-start"]);
    expect(moved[1].sections.map(({ id }) => id)).toEqual([
      "produce-end",
      "dairy",
    ]);
    expect(moved[1].sections[0]).toMatchObject({
      ...layout.aisles[1].sections[1],
      pathOrder: 1,
    });
    expect(
      moved.flatMap((aisle) =>
        aisle.sections.map((section) => section.pathOrder),
      ),
    ).toEqual([0, 1, 2]);
  });

  it("can place a moved section after the destination section", () => {
    const moved = moveSectionToTarget(
      layout.aisles,
      "produce-end",
      "dairy",
      "after",
    );

    expect(moved[1].sections.map(({ id }) => id)).toEqual([
      "dairy",
      "produce-end",
    ]);
    expect(
      moved.flatMap((aisle) =>
        aisle.sections.map((section) => section.pathOrder),
      ),
    ).toEqual([0, 1, 2]);
  });

  it("reorders sections within an aisle", () => {
    const moved = moveSectionToTarget(
      layout.aisles,
      "produce-start",
      "produce-end",
      "after",
    );

    expect(moved[0].sections.map(({ id }) => id)).toEqual([
      "produce-end",
      "produce-start",
    ]);
  });

  it("ignores unknown section identifiers", () => {
    expect(moveSectionToTarget(layout.aisles, "unknown", "produce-start")).toBe(
      layout.aisles,
    );
    expect(moveSectionToTarget(layout.aisles, "produce-start", "unknown")).toBe(
      layout.aisles,
    );
  });

  it("keeps at least one section in every aisle", () => {
    expect(moveSectionToTarget(layout.aisles, "dairy", "produce-start")).toBe(
      layout.aisles,
    );
  });
});
