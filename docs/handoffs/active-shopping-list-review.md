# Handoff — Active Shopping List Feature Review Fixes

## Context

A new **active shopping list** feature was added on branch
`7-active-list-workflow` (commit `66c97ee`, "Add active shopping list APIs,
domain, and UI"). It lets an authenticated user, against their saved store
layout, maintain a single *active* shopping list: add items one at a time, paste
a batch to import, and check/uncheck items. Each item is resolved to a product
concept + aisle location via the existing product-matching service, and the list
is rendered in store-route order.

A `/code-review` (high-effort, recall-biased) pass surfaced the findings below.
The feature is wired into the home page and the three API routes, so several of
these are **user-facing** (duplicate items on retry, slow imports), not latent.

### Files in scope
- `src/components/active-shopping-list.tsx` — client component (add/import/check/refresh, optimistic UI)
- `src/app/page.tsx` — server component wiring (SSR-loads the active list)
- `src/services/active-shopping-list.ts` — service: get/add/import/check, payload shaping, `ActiveShoppingListRequestError`, `deterministicUuid`, `createOrderKey`
- `src/domain/active-shopping-list.ts` — `parseShoppingItemImportLines`, payload types, `FieldErrors`
- `src/db/repositories/shopping-lists.ts` — new query builders (list get/create, route-ordered read, item upsert, check-state update)
- `src/app/api/shopping-list/route.ts`, `.../import/route.ts`, `.../items/[itemId]/route.ts` — route handlers
- `src/app/api/shopping-list/_lib/responses.ts` — `activeShoppingListErrorResponse`
- `src/app/api/_lib/responses.ts` — shared `unauthorizedResponse`, `validationErrorResponse`, `zodErrorToFieldErrors`
- Tests: the `*.test.ts` siblings

### Project conventions (important)
- Use `pnpm` (not npm/yarn). Tests: `pnpm test`. Type/lint as configured.
- This is a non-standard Next.js build — read `node_modules/next/dist/docs/` before
  touching Next-specific code (the async `params` Promise in the `[itemId]` route is
  already correct per the bundled docs; don't "fix" it).
- Track work in GitHub Issues (`konstk1/aisle-flow`); add `Closes #<issue>` to the PR.
  In-app bug reports get the `reported-in-app` label.

### Verified during review (do NOT "re-fix")
- **`deterministicUuid` is correct** — produces a structurally valid v4 UUID
  (8-4-4-4-12, correct version/variant nibbles, no overlapping hex slices).
- **`createOrderKey` lexical ordering is sound** — `getTime()` stays 13 digits
  until year 2286; `padStart(13)` is fine.
- **The mutation_id unique constraint cannot raise an uncaught 500.** mutationId and
  sourceIdentifier are coupled (manual: `manual:${mutationId}`; import:
  `deterministicUuid(sourceIdentifier)`), so a new sourceIdentifier always implies a
  new mutationId — the `(listId, sourceIdentifier)` conflict target always fires
  first. Don't chase this.
- **Route joins are correctly store-scoped** — no cross-store leakage in
  `buildRouteOrderedShoppingItemsQuery`.
- **`shopping_items_checked_at_consistency` is honored** by
  `buildShoppingItemCheckStateQuery` (`checkedAt = coalesce(existing, now)` when
  checked, `null` when unchecked).
- **`parseShoppingItemImportLines` lineNumber is intentionally pre-filter** — error
  messages report the original 1-based source line; this is correct, not an off-by-one.
- **No CLAUDE.md / AGENTS.md convention is violated** by the diff.

---

## Tasks

Ordered: correctness/robustness first, then efficiency, then cleanup/altitude. Each
is independently shippable. Add/adjust tests with every change and run `pnpm test`.

### 1. [Correctness] Retries duplicate items — client mints a fresh `mutationId` per submit
**Files:** `src/components/active-shopping-list.tsx` (lines 70, 94); `src/services/active-shopping-list.ts` (119, 143)

`addItem` and `importItems` both put `mutationId: crypto.randomUUID()` directly in
the fetch body, generating a new id on every click. The server dedups on
`(shoppingListId, sourceIdentifier)` where sourceIdentifier is `manual:${mutationId}`
/ `import:${mutationId}:${index}`. Because the id is fresh per attempt, the unique
index never matches across attempts, so:

- A POST that commits server-side but whose **response is lost** (timeout → the
  component's catch branch shows a connection error) becomes a duplicate when the
  user retries.
- Re-pasting the same import after a failure duplicates **every** line.

The `mutationId` column, `shopping_items_list_mutation_id_unique`, the
`version`/`syncState` columns, and the `sync_operations` table all exist to support
retry-stable, client-authored mutations — but as wired they guarantee nothing.

**Fix direction:** generate the `mutationId` once when the user's intent is formed
(stable per logical add / per import batch, held in component state or a
pending-mutation entry) and reuse it across retries, so the unique index actually
delivers idempotency. For import, the per-line sourceIdentifier should be stable
across retries of the same batch (derive from a stable batch id, not a per-submit
random). **Test:** simulate a retry with the same mutationId and assert no duplicate
row (the service/query test can assert the upsert no-ops on the second call).

### 2. [Efficiency] Import reloads the entire matching catalog once per line
**File:** `src/services/active-shopping-list.ts` — `importActiveShoppingListItems` loop (lines 142–154); see also `src/services/product-matching.ts` `loadProductMatchingCatalog` (~86)

The loop awaits `persistShoppingItem` per line; each call runs
`resolveProductMatchForStore` → `loadProductMatchingCatalog` (full `productConcepts`
scan + curated-alias query + `prepareProductMatchingCatalog`) + `findExactProductAlias`
+ `findProductLocation` + the upsert. On neon-http each query is a separate HTTP
round-trip, so a 50-line paste ≈ **~250 serial round-trips**, re-fetching and
re-preparing the store-global catalog 50 times.

**Fix direction:** load and `prepare` the catalog **once** before the loop and resolve
every line in-memory; batch the per-item alias/location lookups; insert items with a
single multi-row `db.insert(...).values([...])`. This pairs naturally with Task 3
(one transaction). **Test:** assert the catalog load runs once for an N-line import
(spy/mock count), and that ordering/resolution results are unchanged.

### 3. [Correctness/atomicity] Import has no transaction — partial commit on mid-loop failure
**File:** `src/services/active-shopping-list.ts` — `importActiveShoppingListItems` (142–154)

The N inserts are individually committed with no surrounding transaction. If line 30
of 50 fails (DB error, neon-http timeout, a constraint violation), lines 0–29 are
already persisted but the client gets a 500 with no payload and no signal of partial
state. Combined with Task 1, retrying then duplicates everything.

**Fix direction:** wrap the import unit of work in a single `db.transaction` (or the
batched insert from Task 2) so it is all-or-nothing. **Test:** force a failure on one
line and assert zero rows persisted.

### 4. [Correctness/UI] An item can show a real location while flagged "needs correction"
**File:** `src/services/active-shopping-list.ts` — `toItemPayload` (lines 296, 319)

`shoppingItems.productConceptId` is `onDelete: 'set null'` while `resolvedLocationId`
is independent. If a product concept is deleted, `productConceptId` becomes null but
the location/section/aisle still join. Then `hasRouteLocation` (line 296, requires
`productConcept`) is false → `resolutionState='needs-correction'` and the amber
`AlertTriangle` renders — yet the `location` object (line 319 ternary, which omits the
`productConcept` check) is still populated, so `locationLabel` prints a concrete
"Aisle 3 · …". The payload contradicts itself.

**Fix direction:** compute `location` once, then **derive** resolutionState from it:
`location ? "route-resolved" : productConcept ? "matched-unlocated" :
"needs-correction"`. Single source of truth; also removes the redundant double-guard.
**Test:** a row with a location but null productConcept resolves to a single coherent
state.

### 5. [Correctness/UI] Optimistic check race clobbers concurrent in-flight toggles
**File:** `src/components/active-shopping-list.tsx` — `setChecked` / `applyListResponse` (lines 110–154, 56, 139) and `restoreItem` (111, 156)

`setChecked` optimistically updates, then on the PATCH response calls
`applyListResponse` → `setActiveList(result.activeList)`, **fully replacing** local
state with the server snapshot. If the user toggles item A then item B before A's
response returns, A's response (taken at A's commit, before B was processed) reverts
B's checkbox until B's own response lands. On failure, `restoreItem(previousItem)`
writes back a single-item snapshot captured before any concurrent replacement,
resurrecting stale `isChecked`/`checkedAt`.

**Fix direction:** merge the server response by item **id** (and prefer item
`version` if you surface it) instead of wholesale list replacement; scope rollback to
the specific item using its pre-toggle value without overwriting newer state.
Consider not returning/replacing the whole list on a single-item check (see Task 9).
**Test:** simulate two overlapping toggles and assert both end checked.

### 6. [Robustness] Upsert discards the recomputed match on conflict
**File:** `src/db/repositories/shopping-lists.ts` — `buildShoppingItemUpsertQuery` onConflict SET (lines 149–155)

`persistShoppingItem` computes `productConceptId`/`resolvedLocationId` on **every**
call (service 240–252), but the upsert's `set` only touches `updatedAt` (no-op). For
any existing `(listId, sourceIdentifier)` the freshly-computed resolution is thrown
away — wasted work, and an item added before its location was curated can never
re-resolve by re-adding the same line.

**Fix direction:** decide the intended semantics. If re-persist should refresh
resolution, write `productConceptId`/`resolvedLocationId`/`normalizedText` in the
`set`. If items are insert-once, drop the per-persist `resolveProductMatchForStore`
on the conflict path (don't compute then discard). Coordinate with Task 1 (stable
sourceIdentifier makes the conflict path actually reachable). **Test:** assert the
chosen behavior on a second persist of the same sourceIdentifier.

### 7. [Cleanup/dead code] `getOrCreateActiveShoppingList` has an unreachable fallback branch
**File:** `src/services/active-shopping-list.ts` (lines 213–225)

`buildActiveShoppingListCreateQuery` uses `onConflictDoUpdate` against the partial
unique `shopping_lists_one_active_per_store`, so `.returning()` always yields the
inserted-or-updated row — `created` is never undefined and the re-select+throw
fallback (219–225) can never run. **Fix:** collapse to `return existing ?? created`
(throw only if `created` is somehow falsy), removing the dead branch and its extra
round-trip.

### 8. [Cleanup/dead code] `getActiveShoppingListInRouteOrder` is unused
**File:** `src/db/repositories/shopping-lists.ts` (line 185)

Exported but referenced only by its own definition (`grep` across `src/` excluding
tests finds no caller); the service inlines `buildActiveShoppingListQuery` +
`buildRouteOrderedShoppingItemsQuery` directly. **Fix:** delete it (and any test), or
route the service through it — but don't leave a second, drifting copy of the
active-list selection logic.

### 9. [Cleanup/reuse] Error class, FieldErrors type, error→Response mapping, and store-layout guard duplicated from product-corrections
**Files:** `src/services/active-shopping-list.ts` (76–86, 187–201); `src/domain/active-shopping-list.ts` (6); `src/app/api/shopping-list/_lib/responses.ts` (3)

The just-merged product-corrections feature already has all of these:
- `ActiveShoppingListRequestError` (76–86) is byte-identical to
  `ProductCorrectionRequestError` except the name.
- `FieldErrors = Record<string, string[]>` (domain line 6) is a third declaration
  (also in product-corrections and as the `zodErrorToFieldErrors` return).
- `activeShoppingListErrorResponse` re-implements the same `instanceof →
  { error, fieldErrors, status }` mapping product-corrections hand-rolls in its route.
- `requireActiveStoreLayout` (187) duplicates product-corrections'
  `getStoreLayout → null → 409 { form: [...] }` guard.

**Fix:** extract a shared `ApiRequestError` (status + fieldErrors), one `FieldErrors`
type, one generic `errorResponse(error, fallbackMessage)` in `src/app/api/_lib/`, and
one `requireStoreLayout(messageSuffix)` helper; refactor both features onto them.
(The shared `unauthorizedResponse`/`validationErrorResponse` extraction from the
prior review is already done — this finishes the job for the error path.) Also
consider a shared `parseJsonBody(request, message)` — the `try { request.json() }`
block is copied verbatim across all three new routes plus product-corrections.

### 10. [Altitude] `getActiveShoppingList` writes on a read/SSR path
**File:** `src/services/active-shopping-list.ts` — `getActiveShoppingList` → `getOrCreateActiveShoppingList` (96, 99)

The read path (GET route, the refresh button, the SSR render in `page.tsx`, and every
mutation's trailing re-read) calls `getOrCreateActiveShoppingList`, which runs an
`INSERT … onConflict` into `shopping_lists`. So a plain page load performs a write and
needs a writable connection; list existence depends on whoever reads first, and the
"one active list per store" invariant is enforced by a partial-unique race on reads
rather than an explicit lifecycle event. It is currently *safe* (idempotent upsert;
`requirePageSession`'s `cookies()` forces dynamic rendering so Next's route cache
won't duplicate it), but it is the wrong altitude.

**Fix direction (decision needed):** create the active list explicitly when the store
layout is first saved (`replaceStoreLayout` in `store-layout.ts` already owns store
creation), and make `getActiveShoppingList` a pure read that returns an empty/absent
list when none exists. Confirm intent before changing read semantics.

---

## Cross-cutting suggestion
Tasks 1–3 and 6 are tightly related (the mutation/idempotency model). Doing them
together — stable client mutation id + load-catalog-once + single transaction +
deciding the upsert SET semantics — is cleaner than four separate passes, since they
all touch `persistShoppingItem` / the import loop / the upsert.

## Open questions for the human / product owner
1. **Task 1/6:** Are items insert-once, or should re-adding/re-importing the same text
   refresh its resolution? This decides whether the upsert SET writes the recomputed
   match and whether sourceIdentifier must be retry-stable.
2. **Task 5/9:** Should a single-item check return the whole list (current) or just the
   changed item? A delta response (the `version` column already exists) would fix the
   optimistic-race clobbering more cleanly.
3. **Task 10:** Create the active list lazily on read (current) or explicitly on
   layout save?

## Definition of done
- Tasks 1, 3, 4, 5 fixed with regression tests (the user-facing correctness bugs).
- Task 2 fixed (import no longer reloads the catalog per line).
- Task 6 resolved per the Open-questions answer.
- Tasks 7–9 addressed; Task 10 fixed or explicitly deferred with rationale.
- `pnpm test` green; type-check/lint clean.
- No change to any item under "Verified during review (do NOT re-fix)".
