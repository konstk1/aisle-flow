# Aisle Flow

A private, mobile-first shopping list that orders items by the route through a
configured store.

## Stack

- Next.js App Router and TypeScript
- Vercel hosting and Route Handlers
- Neon Postgres through the Vercel integration
- Drizzle ORM with the Neon serverless driver
- Tailwind CSS and Lucide icons

## Prerequisites

- Node.js 20.9 or later
- pnpm 10.11 or later (the repository prevents installs through npm or Yarn)
- A Neon database connected through the Vercel Neon integration for database
  commands and deployed environments

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.sample` to `.env.local` and replace every placeholder.
3. Apply the committed database baseline with `pnpm db:migrate`.
4. Seed the product concept catalog with `pnpm db:seed-product-catalog`.
5. Start the app with `pnpm dev`.

Environment files remain at the repository root because Next.js loads `.env*`
files from there when the application source is in `src/`.

## Environment variables

All variables are server-only. Do not add a `NEXT_PUBLIC_` prefix to any of
them, and never commit real values.

| Variable               | Purpose                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Neon Postgres connection string supplied by the Vercel Neon integration.                                                          |
| `BETTER_AUTH_SECRET`   | At least 32 random characters used by Better Auth to sign and protect authentication state.                                       |
| `BETTER_AUTH_URL`      | Public app base URL used for OAuth callbacks, such as `http://localhost:3000` locally or the Vercel deployment URL in production. |
| `GOOGLE_CLIENT_ID`     | Google OAuth client id for Sign in with Google.                                                                                   |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret for Sign in with Google.                                                                               |
| `ALLOWED_EMAILS`       | Comma-separated allowlist of Google account emails that may sign in.                                                              |
| `GITHUB_ISSUES_TOKEN`  | Required only when in-app feedback is enabled; a fine-grained token restricted to `konstk1/aisle-flow` with `Issues: write` only. |
| `OPENAI_API_KEY`       | Server-only OpenAI key used for batch shopping-item categorization and the local model evaluation command.                        |

The server environment is validated before database access or database
migrations run. Validation reports only invalid variable names, never values.

## Commands

| Command                        | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `pnpm dev`                     | Run the development server.                                               |
| `pnpm build`                   | Create a production build.                                                |
| `pnpm start`                   | Serve a production build.                                                 |
| `pnpm lint`                    | Run ESLint.                                                               |
| `pnpm typecheck`               | Type-check without emitting files.                                        |
| `pnpm format`                  | Apply Prettier formatting.                                                |
| `pnpm format:check`            | Verify formatting without writing files.                                  |
| `pnpm test`                    | Run the Vitest unit tests.                                                |
| `pnpm db:generate`             | Generate a new Drizzle SQL migration after changing the schema.           |
| `pnpm db:migrate`              | Apply committed migrations to Neon.                                       |
| `pnpm db:seed-product-catalog` | Upsert the code-owned product concepts; it does not seed aliases.         |
| `pnpm eval:llm`                | Compare the hard-coded shopping list across the hard-coded OpenAI models. |

The categorization evaluation reads the current product-concept catalog from
the database selected by `DATABASE_URL`, sends no user or store data, and never
writes results. Edit `EVALUATION_MODELS` and `EVALUATION_ITEMS` in
`src/evaluation/product-categorization.ts`, then run
`pnpm eval:llm`. The command requires `DATABASE_URL` and
`OPENAI_API_KEY`; it is intended for manual development use, not CI. Results
are grouped by submitted text for side-by-side model comparison. The summary
includes an estimated USD cost calculated from token usage and the pinned
OpenAI pricing in the evaluation module.

## Data migrations

Run `pnpm db:migrate` against a fresh Neon database to apply the complete MVP
data model, then run `pnpm db:seed-product-catalog`. The committed `0000`
migration is the post-MVP baseline. Its journal timestamp predates the final
migration already applied to the retained development database, so that
database skips the baseline while a fresh database applies it. Do not regenerate
or change the baseline timestamp.

After the baseline, migrations are forward-only: do not delete or edit one
after it has been applied. To roll back development or preview data, discard
the Neon branch/database and create a fresh one before re-running migrations.
For production, restore a verified Neon backup or deploy a separate, reviewed
forward migration that restores the intended schema and data.

The schema keeps route/layout data store-scoped, supports one active list per
user/store, and prevents aliases from conflicting within either global or
store-specific scope. The query layer returns only the signed-in user's list,
product, and location data; source connection credentials and protected
metadata remain server-side.

See [the development store fixture](docs/development-store-fixture.md) for a
small manually-created layout suitable for local or preview testing. It is
documentation only and is never applied automatically.

## Vercel and Neon

1. Import the repository into Vercel as a Next.js project. No custom
   `vercel.json` is required for this standard App Router deployment.
2. Add the Neon integration from the Vercel Marketplace and create or attach a
   Postgres database.
3. Set `DATABASE_URL`, `OPENAI_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ALLOWED_EMAILS` for
   Development, Preview, and Production. Set `GITHUB_ISSUES_TOKEN` when
   deploying in-app feedback.
4. Run `pnpm db:migrate` against the intended database before deploying code
   that depends on a new migration.

`GET /api/health` is the unauthenticated health/readiness endpoint. Every
other application page and API route requires a signed Better Auth session from
an allowlisted Google account.
