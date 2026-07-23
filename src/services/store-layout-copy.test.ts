import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));

import { aisles, aisleSections, stores, user } from "@/db/schema";

import { copyStoreRoute } from "./store-layout";

const sourceStore = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Example Market",
};
const sourceAisle = {
  id: "22222222-2222-4222-8222-222222222222",
  storeId: sourceStore.id,
  identifier: "1",
  displayName: "Produce",
  displayOrder: 0,
};
const sourceSection = {
  id: "33333333-3333-4333-8333-333333333333",
  storeId: sourceStore.id,
  aisleId: sourceAisle.id,
  label: "Front",
  pathOrder: 0,
  side: "center" as const,
};

describe("copyStoreRoute", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it("reads in one batch and atomically inserts the route and switches stores", async () => {
    const storeRead = { kind: "store-read" };
    const layoutRead = { kind: "layout-read" };
    const storeInsert = { kind: "store-insert" };
    const aisleInsert = { kind: "aisle-insert" };
    const sectionInsert = { kind: "section-insert" };
    const currentStoreUpdate = { kind: "current-store-update" };
    const inserts = [storeInsert, aisleInsert, sectionInsert];
    let selectIndex = 0;
    let insertIndex = 0;
    const batch = vi
      .fn()
      .mockResolvedValueOnce([
        [sourceStore],
        [{ aisle: sourceAisle, section: sourceSection }],
      ])
      .mockResolvedValueOnce([]);
    const db = {
      batch,
      insert: vi.fn((table: unknown) => {
        void table;
        const statement = inserts[insertIndex++];
        return { values: vi.fn(() => statement) };
      }),
      select: vi.fn(() => {
        const isStoreRead = selectIndex++ === 0;

        if (isStoreRead) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({ limit: vi.fn(() => storeRead) })),
            })),
          };
        }

        return {
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(() => layoutRead),
              })),
            })),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => currentStoreUpdate) })),
      })),
    };
    mocks.getDb.mockReturnValue(db);

    const copy = await copyStoreRoute(
      sourceStore.id,
      "Example Market copy",
      "user-1",
    );

    expect(copy).toMatchObject({ name: "Example Market copy" });
    expect(batch).toHaveBeenCalledTimes(2);
    expect(batch.mock.calls[0]?.[0]).toEqual([storeRead, layoutRead]);
    expect(batch.mock.calls[1]?.[0]).toEqual([
      storeInsert,
      aisleInsert,
      sectionInsert,
      currentStoreUpdate,
    ]);
    expect(db.insert.mock.calls.map(([table]) => table)).toEqual([
      stores,
      aisles,
      aisleSections,
    ]);
    expect(db.update).toHaveBeenCalledWith(user);
  });
});
