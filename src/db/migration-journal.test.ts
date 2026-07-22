import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Fresh databases apply this pinned baseline, while the retained development
// database skips it because it has already applied the complete old chain.
const BASELINE_TIMESTAMP = 1782179941707;
const RETAINED_DEVELOPMENT_WATERMARK = 1784316025471;

interface MigrationJournal {
  entries: Array<{
    idx: number;
    tag: string;
    when: number;
  }>;
}

function readMigrationJournal(): MigrationJournal {
  const path = fileURLToPath(
    new URL("../../drizzle/meta/_journal.json", import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as MigrationJournal;
}

describe("migration journal", () => {
  it("preserves the baseline and retained development watermarks", () => {
    const { entries } = readMigrationJournal();

    expect(entries[0]).toMatchObject({
      idx: 0,
      tag: "0000_dark_onslaught",
      when: BASELINE_TIMESTAMP,
    });

    for (const [index, entry] of entries.entries()) {
      if (index === 0) {
        continue;
      }

      expect(entry.when).toBeGreaterThan(RETAINED_DEVELOPMENT_WATERMARK);
      expect(entry.when).toBeGreaterThan(entries[index - 1]!.when);
    }
  });
});
