# Handoff — Product-Matching Subsystem Review Fixes

## Context

A new product-matching subsystem was added on branch `5-canonical-shelf-matching`
(not yet committed — changes are in the working tree as modified + untracked files).
It classifies a free-text grocery item string into a product *concept* (shelf
category) using: exact learned aliases → curated/canonical term containment →
department qualifiers (fresh/frozen/canned) → Levenshtein typo correction.

A `/code-review` pass surfaced the findings below. **None are currently
user-visible** because the public entry point `resolveProductMatchForStore`
([src/services/product-matching.ts:36](../../src/services/product-matching.ts))
has no callers yet. Fix them now while the code is fresh and before it is wired
into a route.

### Files in scope
- `src/domain/product-matching.ts` — pure matching logic (normalize, resolve, typo, qualifiers)
- `src/services/product-matching.ts` — DB-backed `resolveProductMatchForStore`, `loadProductMatchingCatalog`
- `src/services/product-catalog.ts` — curated concept/qualifier definitions
- `src/db/product-catalog-seed.ts` — `seedCuratedProductCatalog`
- `src/db/seed-product-catalog.ts` — seed CLI runner (`pnpm db:seed-product-catalog`)
- `src/db/repositories/shopping-lists.ts` — alias/location query builders
- `src/db/schema.ts` — `productConcepts`, `productAliases` tables/enums
- Tests: `src/domain/product-matching.test.ts`, `src/db/repositories/shopping-lists.test.ts`

### Project conventions (important)
- Use `pnpm` (not npm/yarn). Tests: `pnpm test`. Type/lint as configured.
- This is a non-standard Next.js build — read `node_modules/next/dist/docs/` before
  touching Next-specific code (not needed for these fixes, which are domain/db).
- Add a `Closes #<issue>` line if you open a tracking issue; in-app bug reports get
  the `reported-in-app` label (repo `konstk1/aisle-flow`).

---

## Tasks

Ordered: correctness first, then cleanup. Each is independently shippable. Add/adjust
tests with every change and run `pnpm test`.

### 1. [Correctness] Typo correction picks longest term, then rejects by distance
**File:** `src/domain/product-matching.ts` — `findTypoCandidate` (~lines 234–315)

`candidate = candidates[0]` is selected via `compareTermsBySpecificity`, which for
single-word typo terms reduces to *longest first*. The ambiguity guard (lines
277–286) then rejects the match if any **other-concept** term is within
`levenshtein ≤ candidate's distance`. So when the longest in-range term is from
concept B but a *strictly closer* term is from concept A, a legitimate unique
correction is dropped to `needs-user-correction`.

Reproduced: terms `cheese` (concept A, dist 1) and `cheecees` (concept B, len 8,
dist 2) vs input `cheece` → `cheecees` chosen as candidate, `cheese` trips the
guard, match rejected.

**Fix direction:** select the candidate by *edit distance* first (closest wins),
breaking ties by specificity/confidence; only then apply the cross-concept
ambiguity rejection (reject only on a genuine distance *tie* between concepts).
**Test:** add a case proving the closer single-concept correction wins; keep the
existing "does not fuzzy-match ambiguous" behavior for true ties.

### 2. [Correctness] Exact-alias query's `isCorrection` branch isn't source-gated
**File:** `src/db/repositories/shopping-lists.ts` — `buildExactProductAliasLookupQuery` (~line 162)

The WHERE uses `or(source='learned', source='imported', isCorrection=true)`. The
third branch matches **any** source, so a `source='curated', isCorrection=true`
row is returned by the exact path (resolved as a `"learned-alias"` override with
rationale "Used the learned exact alias") *and* loaded into `curatedTerms` by
`loadProductMatchingCatalog`. Latent today (the seed hardcodes `isCorrection:false`
and no constraint forbids the combination), but the OR is broader than the
function name/test imply.

**Fix direction (pick one):** gate the correction branch on source
(`and(isCorrection=true, source IN ('learned','imported'))`), OR add a DB check
constraint that `isCorrection=true` implies a non-curated source. Update the unit
test in `shopping-lists.test.ts` (it asserts exact SQL text + param order — see
the `buildExactProductAliasLookupQuery` test) to match whatever predicate you choose.

### 3. [Correctness] Learned alias `confidence: 0` collides with the unresolved sentinel
**File:** `src/domain/product-matching.ts` — learned-alias branch (~lines 101–114)

`confidence: 0` is allowed by the `0..1` check constraint, and `needsUserCorrection`
also emits `confidence: 0`. A zero-confidence learned alias yields
`{state:"matched", confidence:0}`, which any future consumer gating on
`confidence === 0` / `!confidence` would treat as no-match.

**Fix direction:** treat a zero/non-positive-confidence alias as no override (fall
through to normal matching), or document that `state` — never `confidence` — is the
match gate and add a guard. **Test:** add a case for `confidence: 0`.

### 4. [Cleanup/reuse] Two near-identical alias query builders
**File:** `src/db/repositories/shopping-lists.ts` — `buildExactProductAliasLookupQuery` (144) duplicates `buildProductAliasLookupQuery` (93)

~40 lines copied: identical select, inner join, scope OR-clause, and 3-key
`orderBy` (`isCorrection desc, store-scope desc, confidence desc`). Only one WHERE
predicate differs. **Fix:** extract a shared base builder that takes an optional
extra predicate, so alias precedence can't drift between the two. Coordinate with
task 5 (the general variant may just be deleted).

### 5. [Cleanup] Dead code: `findProductAlias` / `buildProductAliasLookupQuery`
**File:** `src/db/repositories/shopping-lists.ts` (93, 130)

Now referenced only by their own test; the production path uses
`findExactProductAlias`. **Fix:** delete both (and their test), or wire the general
variant in if it is still intended. Confirm with
`grep -rn "buildProductAliasLookupQuery\|findProductAlias" src` before deleting.

### 6. [Cleanup] Seed never updates existing rows
**File:** `src/db/product-catalog-seed.ts` — `seedCuratedProductCatalog` (concepts insert ~line 8/17, aliases insert ~line 43)

Both inserts use `onConflictDoNothing`, so editing `curatedProductConcepts`
(e.g. adding an entry to `excludedTerms`) and re-running `pnpm db:seed-product-catalog`
is a silent no-op on already-seeded DBs — exactly the data you tune when matching
is wrong. **Fix:** use `onConflictDoUpdate` keyed on the relevant unique
constraints (`product_concepts_normalized_name_unique`; alias global/store unique
indexes) to upsert `excludedTerms`/`canonicalName` and alias rows. Watch the
partial unique indexes on `productAliases` (global vs store scope).

### 7. [Efficiency] O(concepts × terms) lookups per resolve
**File:** `src/domain/product-matching.ts` — `findTermCandidates` (~167), `findQualifierCandidates`, `findTermCandidatesForTypos`

`catalog.concepts.find(c => c.id === ...)` runs inside loops over curated terms,
qualifier rules, and typo terms. **Fix:** build a `Map<conceptId, concept>` once
per resolve (or once per catalog load — see task 8) and look up by key.

### 8. [Efficiency] Re-normalizing already-normalized data every call
**File:** `src/domain/product-matching.ts` (~152, 328, 370) and the catalog load path

`normalizeProductText` is re-applied to `concept.normalizedName`, curated
`term.text`, `excludedTerms`, and `rule.qualifier` — all normalized at rest — on
every match, and `findTermCandidatesForTypos` is rebuilt from scratch each typo
resolution. **Fix:** precompute the normalized/derived structures once when the
catalog is loaded (`loadProductMatchingCatalog`) and reuse across inputs. Tasks 7
and 8 are naturally done together (a prepared, indexed catalog object).

### 9. [Altitude] Qualifier `productTerms` hardcoded three times
**File:** `src/services/product-catalog.ts` — `curatedQualifierRules` (~line 46)

`["broccoli","peas"]` is repeated across fresh/frozen/canned plus the produce
concept. Adding a fourth qualifiable product means editing four arrays in lockstep;
miss one and `frozen X` resolves while `canned X` silently doesn't. **Fix:** derive
the qualifiable term set from the produce concept (single source of truth).

### 10. [Behavior gap] Imported aliases never become curated terms
**File:** `src/services/product-matching.ts` — `loadProductMatchingCatalog` (~line 96)

Filters `source='curated'` only, so an `imported` alias (e.g. `basmati → rice`)
can only *exact*-match — it won't substring-match `organic basmati`. **Decision
needed:** if imported vocabulary should behave like curated terms, change the
filter to `source IN ('curated','imported')`. If imported aliases are intended to
be exact-only, leave as-is and add a code comment saying so. Confirm intent before
changing (see "Open questions").

---

## Verified non-issues (do not "fix")
- **Store-scope isolation is preserved** between the two query builders — no
  cross-store leakage. The scope OR-clause is identical.
- **`"fresh frozen broccoli"` → needs-user-correction is intended** — codified by a
  test in `product-matching.test.ts`. `hasConflictingQualifiers` deliberately
  rejects 2+ distinct qualifiers. (It does over-reject the real term "fresh frozen
  X", but that's a known design limitation, not a bug. Leave unless product
  explicitly wants it handled.)

## Open questions for the human / product owner
1. Task 10: should `imported` aliases participate in substring matching, or stay exact-only?
2. Task 2: prefer a query-level source gate or a DB constraint coupling `isCorrection` to source?
3. Confidence constants (0.91/0.95/0.97/0.99) are *displayed* but ranking is decided
   by specificity in `compareCandidates`; confidence is only a tiebreaker. Is that
   intended? (Not a fix task — flag if it surprises anyone.)

## Definition of done
- Tasks 1–3 fixed with regression tests; tasks 4–10 addressed or explicitly deferred
  with rationale.
- `pnpm test` green; type-check/lint clean.
- No behavior change to the two verified non-issues above.
