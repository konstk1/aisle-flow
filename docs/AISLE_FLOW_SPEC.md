# Aisle Flow

Repository: `aisle-flow`

## Purpose

Aisle Flow is a private, mobile-friendly shopping list app that sorts items in the order they are encountered in a specific store. The MVP uses a text-based store layout with multiple sections per aisle, informational left/right-side placement, learned product locations, and eventual synchronization with an external shopping-list provider. A visual store map may be added later.

Alexa synchronization is deferred. The application must not depend on a custom Alexa skill and should use a provider-neutral synchronization interface so an official or otherwise reasonable list API can be connected later.

## Primary Workflow

1. Add or import shopping-list items.
2. Resolve exact learned aliases, then categorize the remaining submitted
   items in one structured AI request.
3. Find the product's learned location in the selected store.
4. Sort the list by the configured route through the store.
5. Check off items while shopping.
6. Persist manual location corrections for future lists.

## Store Layout

A store contains aisles, and each aisle contains one or more ordered sections. The MVP represents this layout as text rather than a floorplan.

Each aisle section records:

- Aisle identifier and display number
- One absolute path order used for shopping-list sorting
- Side: `left`, `right`, `center`, or `endcap`
- Optional display name

Shopping order follows the store-wide absolute path order. The editor keeps
aisle groups in an explicit order so it can recalculate contiguous path numbers
after a section is added, deleted, or moved. A section's side does not affect
sorting.

## Product Matching

Shopping-list text is resolved to shelf-level canonical categories rather than distinct product variants. The original entered text remains on the shopping item for display, while sorting uses the resolved category's store location.

Examples:

- `jasmine rice` -> `rice`
- `brown rice` -> `rice`
- `frozen peas` -> `frozen vegetables`
- `frozen broccoli` -> `frozen vegetables`
- `fresh broccoli` -> `produce`
- `rice vinegar` -> `vinegar`

Matching should use these progressively less certain methods:

1. Normalize the entered text.
2. Match a learned alias.
3. Match canonical shelf-category text and curated category terms.
4. Apply meaningful department qualifiers such as `frozen`, `fresh`, and `canned`.
5. Apply conservative fuzzy matching for minor misspellings, such as `brocolli` -> `broccoli`.
6. Ask for a category and location when confidence is insufficient.

Matching must prefer longer or more specific phrases and support exclusions so a broad term does not cause an incorrect result. For example, matching `rice` must not classify `rice vinegar`, `rice cakes`, or `rice noodles` as the `rice` category.

When an item cannot be matched confidently, the app creates or selects a canonical shelf category and asks the user to assign its aisle section. The correction is persisted as an exact learned alias. For example, assigning `wild rice` to `rice` records `wild rice` -> `rice` for future lists.

Manual corrections always take precedence. A correction writes two records with different owners: the learned alias belongs to the correcting user (personal vocabulary that follows the user across stores), while the category location belongs to the store. Matching prefers the user's own alias over global catalog aliases. Semantic embeddings and vector search are deferred from the MVP.

Submitted batches use a pinned OpenAI model through the Vercel AI SDK. The
model separates optional free-text quantity from the displayed item name,
and chooses an existing product concept or suggests one. Every item returned
directly by the model displays an AI indicator, including items assigned to an
existing concept. An existing-concept result also records a user-scoped alias
without replacing any existing alias. A later exact alias match does not
display the AI indicator because the unchanged categorization is treated as
accepted. Manual corrections replace the learned alias and remain
authoritative. Suggested concepts are not created, and no alias is learned,
until the user approves the concept and chooses its store location. If
categorization fails, no item is written and the user must explicitly Retry or
Add without AI. Ordinary item-name edits continue to use the deterministic
matcher; quantity-only edits never rematch an item.

## Technical Architecture

- Application: Next.js App Router with TypeScript
- Hosting and API routes: Vercel
- Database: Neon Postgres through the Vercel integration
- Database access: Drizzle ORM and Neon serverless driver
- UI icons: Lucide

The application will initially require a network connection. Full offline support, IndexedDB, service-worker mutation queues, and conflict resolution are deferred.

Initial network resilience should include:

- Optimistic checkbox updates
- Automatic request retry
- Visible unsynced/error state
- Client-generated mutation UUIDs for idempotency
- `updated_at` or version fields for future conflict handling
- Optional localStorage snapshot of the active list

## Suggested Data Model

### `stores`

Store identity, name, active route, and creator. Only the creating user can rename, delete, or edit the layout of a store; stores created before ownership existed have no creator and stay manageable by everyone. Any user can shop against any store.

### `aisles`

Store reference, aisle number/name, and editor group order.

### `aisle_sections`

Aisle reference, one absolute path order, informational side, and label.

### `product_concepts`

Canonical shelf-category name and matching metadata.

### `product_aliases`

Normalized phrase, canonical product reference, scope, confidence, and correction metadata. Scope is `global` (seeded catalog vocabulary, no owner) or `user` (learned corrections owned by the user who made them). Aliases are store-independent: they follow the user across stores and survive store deletion; only `product_locations` are store-scoped.

### `product_locations`

Store, canonical shelf category, aisle section, optional position within the section, confidence, and source.

### `shopping_lists`

List state, source, external identifier, and synchronization metadata. The MVP exposes one persistent active list; list history and archives are deferred.

### `shopping_items`

Raw text, normalized text, optional free-text quantity, canonical or suggested
product concept, categorization source, resolved location, checked state,
ordering key, source identifier, and synchronization state.

### `source_connections`

External provider configuration and encrypted/token references for future synchronization.

### `sync_operations`

Idempotent synchronization attempts, direction, status, timestamps, and errors.

## Provider Boundary

External lists should implement a source-neutral interface similar to:

```ts
interface ShoppingListSource {
  pullChanges(cursor?: string): Promise<PullResult>;
  addItem(item: SourceItemInput): Promise<SourceItem>;
  updateItem(id: string, patch: SourceItemPatch): Promise<SourceItem>;
  deleteItem(id: string): Promise<void>;
}
```

Initial sources may be manual entry and pasted/imported text. Alexa or another provider can be added without changing the core list model.

## Synchronization

While the application is open:

- Apply mutations optimistically.
- Poll for remote changes every 15-30 seconds if needed.
- Synchronize immediately when the page opens or regains connectivity.
- Prefer provider webhooks when available.

Vercel Hobby cron jobs run only daily, so they are not suitable for frequent background polling. If a future provider requires minute-level background polling, use Vercel Pro or a separate scheduler.

## Access Control

The app uses Google sign-in with an explicit email allowlist.

- One login page with Sign in with Google
- Store `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ALLOWED_EMAILS` in Vercel environment variables
- Signed Better Auth session cookie
- Page and API route session checks for protected data
- Shopping-list ownership scoped by authenticated user id
- Store management (rename, delete, layout edits) restricted to the store's creator
- Learned aliases owned by the correcting user; other users' aliases are not readable or editable
- No public signup, roles, or email/password flow

Provider webhook endpoints must use provider signatures or dedicated secrets rather than the browser session.

## In-App Bug Reporting

Add a small floating bug button in the bottom-right corner. It opens a simple text-entry modal and submits to `POST /api/feedback`.

The server route:

1. Verifies the application session.
2. Validates and limits the report text.
3. Creates an issue in the `konstk1/aisle-flow` GitHub repository.
4. Applies the `reported-in-app` label.
5. Returns the issue number and URL.

Include this metadata in the issue body:

- Report text
- Current page URL
- Timestamp
- Browser and viewport
- Vercel deployment URL or commit SHA

Use a fine-grained GitHub token restricted to the repository with only `Issues: write`, stored server-side as `GITHUB_ISSUES_TOKEN`. Never expose the token to the browser.

## MVP Scope

- Google sign-in restricted to allowlisted email addresses
- Multiple stores with creator-only management and a per-user current store
- Text-based aisle and section editor
- Multiple ordered sections per aisle
- One absolute section path order for route sorting
- Informational left/right/center/endcap placement
- One persistent active shopping list per user with manual entry and checkoff
- Route-sorted shopping view
- Shelf-category, qualifier-aware, typo-tolerant, and learned-alias matching
- Manual item relocation with learned corrections
- In-app GitHub issue reporting
- Provider adapter interface without Alexa integration

## User Interface Direction

Use a clean, modern, mobile-first interface with restrained system typography, generous whitespace, subtle dividers, and minimal use of cards or pill-shaped controls. Avoid decorative gradients and unnecessary visual effects.

Shopping-item checkboxes should resemble the Apple Notes checklist interaction:

- Round outlined control for an unchecked item
- Solid black circle with a white check for a checked item
- Muted, struck-through item text after checkoff
- Comfortable touch targets without making the visible control oversized

## Deferred Work

- Alexa or other external provider synchronization
- Visual store maps, floorplan geometry, and Vercel Blob storage
- Semantic embeddings, `pgvector`, and vector search
- Full offline mode
- Multi-user accounts and shared lists
- Multiple shopping lists, history, and archives
- Screenshot annotation in bug reports
- Frequent background sync infrastructure
- Advanced route optimization beyond the configured absolute path

## Relevant Documentation

- [Neon for Vercel](https://vercel.com/marketplace/neon/)
- [Neon pricing](https://neon.com/pricing)
- [Vercel Hobby limits](https://vercel.com/docs/accounts/plans/hobby)
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [GitHub create-issue API](https://docs.github.com/en/rest/issues/issues#create-an-issue)
- [Alexa list API deprecation](https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html#list-skills-and-alexa-shopping-and-to-do-lists)
