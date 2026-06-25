# Handoff — Product-Corrections Feature Review Fixes

## Context

A new **product-corrections** feature was added on branch
`6-mvp-corrections-learned-aliases` (commit `a5ee605`, "Add product corrections
API, service, DB queries"). It lets an authenticated user resolve an unmatched
shopping-list phrase by attaching it to a product *concept* (shelf category) and a
store *aisle section*. Saving a correction:

1. resolves or creates the product concept,
2. upserts a store-scoped **learned** alias (`isCorrection=true`) for the
   normalized phrase, and
3. upserts the store's single product **location** for that concept,

then re-runs matching to return a `resolution` payload.

A `/code-review` (high-effort, recall-biased) pass surfaced the findings below.
The feature is API-complete but **has no UI caller yet** (the route is the only
consumer), so these are best fixed now while the code is fresh and before a client
depends on the response shape.

### Files in scope
- `src/app/api/product-corrections/route.ts` — `GET` (options) + `POST` (apply) handlers
- `src/services/product-corrections.ts` — `applyProductCorrection`, `getProductCorrectionOptions`, request schema, `ProductCorrectionRequestError`
- `src/db/repositories/product-corrections.ts` — concept/alias/location query builders
- `src/services/product-matching.ts` — `loadProductMatchingCatalog` (the catalog learned corrections must eventually feed)
- `src/db/repositories/shopping-lists.ts` — existing `Database` type, `findExactProductAlias`
- `src/app/api/store-layout/route.ts` — sibling route holding the helpers this one duplicated
- Tests: the three `*.test.ts` siblings of the in-scope files

### Project conventions (important)
- Use `pnpm` (not npm/yarn). Tests: `pnpm test`. Type/lint as configured.
- This is a non-standard Next.js build — read `node_modules/next/dist/docs/` before
  touching Next-specific code (not needed for these fixes, which are service/db).
- Track work in GitHub Issues (`konstk1/aisle-flow`); add `Closes #<issue>` to the PR.
  In-app bug reports get the `reported-in-app` label.

### Verified during review (do NOT "re-fix")
- **`db.batch([alias, location])` is atomic.** The neon-http driver runs the batch
  as a single transaction, so the alias and location writes are all-or-nothing —
  there is no partial alias/location write to guard against.
- **`isForeignKeyError` (`error.code === "23503"`) actually fires.** `NeonDbError`
  exposes `.code`, and `db.batch` throws it, so a concurrent section/concept delete
  is correctly converted to a 409. (But see Task 8 — the helper is duplicated.)
- **`positionWithinSection: 0` is preserved.** `input.positionWithinSection ?? null`
  correctly keeps `0`; it is not a falsy-zero bug.
- **All three `ON CONFLICT` targets match real constraints** (concept
  `normalized_name` unique; alias partial unique `(store_id, normalized_text) WHERE
  scope='store'`; location `(store_id, product_concept_id)` unique). No "no unique
  constraint matching" runtime risk.
- **No CLAUDE.md / AGENTS.md convention is violated** by the diff.

---

## Tasks

Ordered: correctness/robustness first, then design/altitude, then cleanup. Each is
independently shippable. Add/adjust tests with every change and run `pnpm test`.

### 1. [Correctness] `getOrCreateProductConcept` can throw a 500 for a valid create
**File:** `src/services/product-corrections.ts` — `getOrCreateProductConcept` (~lines 283–313)

The function does `INSERT ... onConflictDoNothing().returning()`
([`buildProductConceptCreateQuery`](../../src/db/repositories/product-corrections.ts), repo line 59),
then, when that returns `[]`, a **separate** `SELECT` by normalized name
(service line 295 → 305). These are two non-transactional neon-http round-trips.

Race: two requests create the same new `canonicalName` ("Dried fruit") at once.
Request B's insert hits the `product_concepts_normalized_name_unique` conflict and
returns `[]`; B then SELECTs before request A's separately-auto-committed insert is
visible to B's connection, so `existingConcept` is `undefined` and the code throws
`"Product concept conflict did not return an existing row."` (line 311) — surfacing
as a generic **500** for an operation that should have succeeded.

**Fix direction:** replace the insert-then-select with a single
`INSERT ... ON CONFLICT (normalized_name) DO UPDATE SET canonical_name =
excluded.canonical_name RETURNING` so a row is **always** returned in one
statement. This is the exact pattern the alias/location builders in the same module
already use (repo lines 92, 123). The dead `if (!existingConcept) throw` branch then
goes away. **Test:** assert the create path returns the existing row on conflict
(query-builder SQL test in `product-corrections.test.ts`).

### 2. [Correctness] Concept is created outside `db.batch`, so a failed batch orphans it
**File:** `src/services/product-corrections.ts` — `applyProductCorrection` (concept at line 192, batch at line 200)

Concept resolution (line 192) runs in its own round-trip **before** the
alias+location `db.batch` (line 200). The batch is atomic, but the concept insert is
not part of it. If the batch fails — e.g. the chosen `aisleSectionId` is concurrently
deleted between the layout snapshot read (line 164/178) and the write, raising FK
`23503` on `product_locations_store_section_foreign_key` — the new
`product_concepts` row is already committed and left **orphaned** (no alias/location
references it). Because `normalized_name` is unique, later unrelated corrections
silently reuse the orphan.

**Fix direction (pick one):**
- Fold concept creation into the same `db.batch` as the alias/location writes (one
  transaction) so a failure rolls the concept back too; or
- Only create the concept after the section is re-validated within the transaction.

Combining with Task 1 (single `ON CONFLICT ... RETURNING`) makes the concept write a
batchable statement. **Test:** simulate a batch FK failure and assert no concept row
persists (or document/accept orphaning explicitly if product prefers it).

### 3. [Efficiency/correctness] Final `resolveProductMatchForStore` re-query re-derives known data
**File:** `src/services/product-corrections.ts` — `applyProductCorrection` return (line 257)

After the batch, the function calls
[`resolveProductMatchForStore`](../../src/services/product-matching.ts) with the raw
text purely to populate the `resolution` field. That helper re-loads the **entire**
matching catalog (full `product_concepts` scan + curated-alias query), re-runs
`findExactProductAlias`, and re-runs `findProductLocation` — 3+ extra DB round-trips
to recompute state the function already holds (`productConcept`, `alias`, `location`
are in scope at lines ~240–256 from the batch `RETURNING` rows).

Beyond the wasted work, the re-resolution can **disagree** with the alias/location
returned in the same response if normalization or a curated qualifier rule routes the
raw text differently — yielding an internally inconsistent payload immediately after
a successful save.

**Fix direction:** build the `resolution` (a `StoreProductMatchResult`) directly from
the concept/alias/location rows already in hand via a small mapping function. Only
fall back to a real re-resolution if there is a genuine semantic need to re-run
matching. **Test:** assert the returned `resolution` is consistent with the returned
`alias`/`location` without a second catalog load (mock the matcher and assert it is
not called, or assert the mapped shape).

### 4. [Altitude / behavior gap] Learned corrections only match byte-identical text
**File:** `src/services/product-matching.ts` — `loadProductMatchingCatalog` (~line 96/99); writes in `src/db/repositories/product-corrections.ts` (`buildManualProductAliasCorrectionQuery`, line ~79)

Corrections write `source='learned'`, but `loadProductMatchingCatalog` filters the
fuzzy/substring catalog to `source='curated'` only. Learned aliases are therefore
reachable **only** via `findExactProductAlias` on the identical normalized string.
So correcting "organic bananas" does nothing for "bananas organic", a one-char typo,
or an added qualifier next time — the whole point of "learning" an alias is bypassed
for everything except an exact repeat.

**Decision needed (see Open questions):** if learned corrections should generalize
like curated terms, feed them into `prepareProductMatchingCatalog` (e.g. extend the
catalog load to include `source='learned'` store aliases, possibly at a distinct
confidence tier). If exact-only is the intended MVP behavior, leave as-is and add a
code comment at the catalog filter saying so, so the next reader doesn't treat it as
a bug. Confirm intent before changing matching behavior.

### 5. [Robustness] Alias upsert is last-writer-wins with no version/conflict guard
**File:** `src/db/repositories/product-corrections.ts` — `buildManualProductAliasCorrectionQuery` `onConflictDoUpdate` (line 92)

The upsert overwrites `productConceptId`, `confidence`, `source`, `isCorrection` from
`excluded.*` for any existing `scope='store'` row at `(store_id, normalized_text)`,
regardless of the existing row's source or confidence. Unlike `product_locations`
(which bumps `version` on conflict, repo line ~131), `product_aliases` has **no
version column**, so two concurrent corrections mapping the same phrase to different
concepts both succeed and the later commit silently wins — an undetectable lost
update.

Today only learned store aliases exist (the seed creates `scope='global'` curated
aliases only), so there is no curated store row to clobber *yet*. But any future
curated/higher-confidence store alias for the same text would be silently flipped to
`source='learned', isCorrection=true`.

**Fix direction (pick per product intent):**
- Narrow the upsert `set`/`targetWhere` so it only updates rows that are themselves
  corrections (don't overwrite a non-`learned` source); and/or
- Accept last-writer-wins explicitly and add a comment. A `version` column on
  `product_aliases` would be the deeper fix if alias corrections need to participate
  in the same optimistic-concurrency/sync contract as locations and items.

**Test:** cover re-correcting the same phrase to a different concept; assert the
chosen semantics.

### 6. [Cleanup/reuse] `unauthorizedResponse` duplicated from the store-layout route
**File:** `src/app/api/product-corrections/route.ts` (line 11) duplicates `src/app/api/store-layout/route.ts` (line 11)

Byte-identical `function unauthorizedResponse() { return Response.json({ error:
"Unauthorized" }, { status: 401 }); }`. Two copies means the 401 envelope can drift.
**Fix:** extract one shared helper (e.g. `src/app/api/_lib/responses.ts` or similar)
and import it in both routes.

### 7. [Cleanup/reuse] `validationResponse` (zod → fieldErrors) duplicated from the store-layout route
**File:** `src/app/api/product-corrections/route.ts` (line 15) duplicates `src/app/api/store-layout/route.ts` (line 15)

The issue-iteration mapper (`issue.path.join(".") || "form"`, `fieldErrors[field]
??= []`, status 422) is identical; only the top-level `error` message differs.
**Fix:** share a `zodErrorToFieldErrors(error, message)` helper so the
validation-error contract is defined once. Do tasks 6–8 together (one shared
api/db-error util module).

### 8. [Cleanup/reuse] `isForeignKeyError` duplicated from the store-layout route
**File:** `src/services/product-corrections.ts` (line 345) duplicates `src/app/api/store-layout/route.ts` (line 33)

Identical Postgres `23503` SQLSTATE check. **Fix:** extract a single
`isForeignKeyError` (e.g. a `src/db` error-utils module) and import it in both the
service and the store-layout route.

### 9. [Cleanup/reuse] `Database` type alias redeclared
**File:** `src/db/repositories/product-corrections.ts` (line 6) duplicates `src/db/repositories/shopping-lists.ts` (line 13)

`export type Database = ReturnType<typeof createDatabase>` already exists in
`shopping-lists.ts` (and `product-matching.ts` imports it from there). **Fix:** import
`Database` from the single existing source instead of redeclaring it (or hoist it to a
shared `src/db` module and have both repos import it).

### 10. [Cleanup] Normalize-non-empty validation duplicated between schema and service
**File:** `src/services/product-corrections.ts` — schema `canonicalName.refine` (line ~56) vs `getOrCreateProductConcept` guard (line 286)

`productCorrectionRequestSchema` already rejects a `canonicalName` whose
`normalizeProductText(...)` form is empty (with the message "Enter a shelf category
name with letters or numbers."). `getOrCreateProductConcept` re-checks `if
(!normalizedName)` and throws the **same** message — dead defensive code given the
schema guarantee. **Fix:** keep one. If you keep the schema refine (preferred — fails
at the boundary), drop the service guard; or vice-versa. Don't leave both with the
same hardcoded message.

---

## Open questions for the human / product owner
1. **Task 4:** Should learned corrections participate in fuzzy/substring matching
   (feed the catalog), or stay exact-only for the MVP? This decides whether Task 4 is
   a behavior change or a documentation comment.
2. **Task 5:** Is last-writer-wins acceptable for alias corrections, or do aliases
   need a `version` column / sync-conflict semantics like locations and items?
3. **Task 2:** Prefer folding the concept write into the batch transaction, or accept
   orphan concepts (they're harmless beyond clutter and get reused)?

## Definition of done
- Tasks 1–3 fixed with regression tests (these are the correctness/robustness +
  wasted-work items).
- Tasks 4–5 resolved per the Open-questions answers (fix or documented decision).
- Tasks 6–10 addressed or explicitly deferred with rationale.
- `pnpm test` green; type-check/lint clean.
- No change to any item in "Verified during review (do NOT re-fix)".
