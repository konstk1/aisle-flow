import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readArchiveCutoff,
  saveArchiveCutoff,
  subscribeToArchiveCutoff,
} from "./shopping-list-archive";

describe("persistent shopping list archive", () => {
  let storage: Map<string, string>;
  let browser: EventTarget & {
    localStorage: Pick<Storage, "getItem" | "setItem">;
  };

  beforeEach(() => {
    storage = new Map();
    browser = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    vi.stubGlobal("window", browser);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("persists the cutoff per list and restores it from browser storage", async () => {
    const cutoff = Date.parse("2026-01-01T00:00:00Z");
    saveArchiveCutoff("groceries", cutoff);
    // A fresh module has no session memory, as after a full reload.
    vi.resetModules();
    const reloaded = await import("./shopping-list-archive");
    expect(reloaded.readArchiveCutoff("groceries")).toBe(cutoff);
    expect(reloaded.readArchiveCutoff("another-list")).toBeNull();
  });

  it("notifies the current view and other tabs, and cleans up subscriptions", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToArchiveCutoff(onChange);
    saveArchiveCutoff("notifications", 100);
    browser.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveArchiveCutoff("notifications", 200);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it.each(["", "NaN", "Infinity", "-1", "garbage"])(
    "ignores an invalid saved cutoff: %s",
    (value) => {
      storage.set("aisle-flow:archive-cutoff:invalid", value);
      expect(readArchiveCutoff("invalid")).toBeNull();
    },
  );

  it("still archives during the session if storage rejects writes", () => {
    browser.localStorage.setItem = () => {
      throw new Error("Storage unavailable");
    };
    saveArchiveCutoff("unavailable", 123);
    expect(readArchiveCutoff("unavailable")).toBe(123);
  });
});
