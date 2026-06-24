import { describe, expect, it } from "vitest";

import { storeLayoutSchema } from "./store-layout";

const layout = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example Market",
  aisles: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      identifier: "1",
      displayName: null,
      sections: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          label: "Produce",
          pathOrder: 0,
          side: "left" as const,
        },
      ],
    },
  ],
};

describe("storeLayoutSchema", () => {
  it("normalizes blank optional labels to null", () => {
    const result = storeLayoutSchema.parse({
      ...layout,
      aisles: [
        {
          ...layout.aisles[0],
          displayName: "   ",
          sections: [{ ...layout.aisles[0].sections[0], label: "" }],
        },
      ],
    });

    expect(result.aisles[0].displayName).toBeNull();
    expect(result.aisles[0].sections[0].label).toBeNull();
  });

  it("rejects duplicate absolute path orders across aisles", () => {
    const result = storeLayoutSchema.safeParse({
      ...layout,
      aisles: [
        ...layout.aisles,
        {
          ...layout.aisles[0],
          id: "44444444-4444-4444-8444-444444444444",
          identifier: "2",
          sections: [
            {
              ...layout.aisles[0].sections[0],
              id: "55555555-5555-4555-8555-555555555555",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["aisles", 1, "sections", 0, "pathOrder"],
          }),
        ]),
      );
    }
  });

  it("permits the same path order only after it is changed to an unused value", () => {
    const result = storeLayoutSchema.safeParse({
      ...layout,
      aisles: [
        {
          ...layout.aisles[0],
          sections: [
            ...layout.aisles[0].sections,
            {
              ...layout.aisles[0].sections[0],
              id: "44444444-4444-4444-8444-444444444444",
              label: "Fruit",
              pathOrder: 1,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
