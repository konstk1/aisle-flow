import { describe, expect, it } from "vitest";

import { compareStoreRoutePositions } from "./compare-store-route-positions";

describe("compareStoreRoutePositions", () => {
  it("orders items by the configured path before their local position", () => {
    expect(
      compareStoreRoutePositions(
        {
          pathOrder: 4,
          positionWithinSection: 1,
        },
        {
          pathOrder: 5,
          positionWithinSection: 0,
        },
      ),
    ).toBeLessThan(0);
  });

  it("uses the section position when items share a path order", () => {
    expect(
      compareStoreRoutePositions(
        {
          pathOrder: 4,
          positionWithinSection: 2,
        },
        {
          pathOrder: 4,
          positionWithinSection: 1,
        },
      ),
    ).toBeGreaterThan(0);
  });
});
