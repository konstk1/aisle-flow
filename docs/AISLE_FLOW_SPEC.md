# Aisle Flow

Repository: `aisle-flow`

## Purpose

Aisle Flow is a private, mobile-friendly shopping list app that sorts items in the order they are encountered in a specific store. The MVP uses a text-based store layout with multiple sections per aisle, informational left/right-side placement, learned product locations, and eventual synchronization with an external shopping-list provider. A visual store map may be added later.

Alexa synchronization is deferred. The application must not depend on a custom Alexa skill and should use a provider-neutral synchronization interface so an official or otherwise reasonable list API can be connected later.

## Primary Workflow

1. Add or import shopping-list items.
2. Resolve each item to a canonical product or category.
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

Manual corrections always take precedence and become learned aliases or store-specific category locations. Semantic embeddings and vector search are deferred from the MVP.

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

Store identity, name, and active route.

### `aisles`

Store reference, aisle number/name, and editor group order.

### `aisle_sections`

Aisle reference, one absolute path order, informational side, and label.

### `product_concepts`

Canonical shelf-category name and matching metadata.

### `product_aliases`

Normalized phrase, canonical product reference, scope, confidence, and correction metadata.

### `product_locations`

Store, canonical shelf category, aisle section, optional position within the section, confidence, and source.

### `shopping_lists`

List state, source, external identifier, and synchronization metadata. The MVP exposes one persistent active list; list history and archives are deferred.

### `shopping_items`

Raw text, normalized text, canonical product, resolved location, checked state, ordering key, source identifier, and synchronization state.

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

The app is single-user. It needs access control, not a multi-user identity system.

- One login page and one strong password
- Store only `APP_PASSWORD_HASH` in Vercel environment variables
- Store a separate `SESSION_SECRET`
- Signed `HttpOnly`, `Secure`, `SameSite=Lax` session cookie
- Middleware protection for all pages and API routes
- Basic login rate limiting
- No signup, OAuth, roles, email flow, or users table

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

- Single-password access gate
- One store
- Text-based aisle and section editor
- Multiple ordered sections per aisle
- One absolute section path order for route sorting
- Informational left/right/center/endcap placement
- One persistent active shopping list with manual entry and checkoff
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
