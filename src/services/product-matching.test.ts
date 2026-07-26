import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExactProductAlias: vi.fn(),
  findProductLocation: vi.fn(),
}));

vi.mock("@/db/repositories/shopping-lists", () => ({
  findExactProductAlias: mocks.findExactProductAlias,
  findProductLocation: mocks.findProductLocation,
}));
vi.mock("@/db/product-catalog-seed", () => ({
  ensureUserProductCatalog: vi.fn(),
}));

import { createStoreProductMatcher } from "./product-matching";

const concepts = [
  {
    id: "produce",
    userId: "user-a",
    seedKey: "produce",
    canonicalName: "produce",
    normalizedName: "produce",
    excludedTerms: [],
    version: 1,
    deletedAt: null,
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    updatedAt: new Date("2026-07-22T00:00:00.000Z"),
  },
  {
    id: "rice",
    userId: "user-a",
    seedKey: "rice",
    canonicalName: "rice",
    normalizedName: "rice",
    excludedTerms: ["rice vinegar", "rice cakes", "rice noodles"],
    version: 1,
    deletedAt: null,
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    updatedAt: new Date("2026-07-22T00:00:00.000Z"),
  },
  {
    id: "vinegar",
    userId: "user-a",
    seedKey: "vinegar",
    canonicalName: "vinegar",
    normalizedName: "vinegar",
    excludedTerms: [],
    version: 1,
    deletedAt: null,
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    updatedAt: new Date("2026-07-22T00:00:00.000Z"),
  },
];

describe("createStoreProductMatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findExactProductAlias.mockResolvedValue(null);
  });

  it.each([
    ["broccoli", "produce"],
    ["rice vinegar", "vinegar"],
  ])("resolves the personal seeded term %s", async (text, productConceptId) => {
    const aliases = [
      {
        productConceptId: "produce",
        displayText: "broccoli",
        seedKey: "produce:broccoli",
      },
      {
        productConceptId: "vinegar",
        displayText: "rice vinegar",
        seedKey: "vinegar:rice vinegar",
      },
    ];
    const where = vi
      .fn()
      .mockResolvedValueOnce(concepts)
      .mockResolvedValueOnce(aliases);
    const from = vi.fn(() => ({ where }));
    const db = { select: vi.fn(() => ({ from })) } as never;
    const matchProduct = await createStoreProductMatcher({
      db,
      userId: "user-a",
      storeId: null,
    });

    await expect(matchProduct(text)).resolves.toMatchObject({
      state: "matched",
      productConcept: { id: productConceptId },
      source: "curated-term",
    });
    expect(mocks.findExactProductAlias).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledTimes(2);
  });
});
