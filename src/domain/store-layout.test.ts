import { describe, expect, it } from "vitest";

import {
  getRouteSections,
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
