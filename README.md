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
3. Generate the initial migration with `pnpm db:generate`.
4. Apply it with `pnpm db:migrate`.
5. Start the app with `pnpm dev`.

Environment files remain at the repository root because Next.js loads `.env*`
files from there when the application source is in `src/`.

## Environment variables

All variables are server-only. Do not add a `NEXT_PUBLIC_` prefix to any of
them, and never commit real values.

| Variable              | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`        | Neon Postgres connection string supplied by the Vercel Neon integration.         |
| `APP_PASSWORD_HASH`   | Hash of the single application password; never a raw password.                   |
| `SESSION_SECRET`      | At least 32 random characters used to sign the session cookie.                   |
| `GITHUB_ISSUES_TOKEN` | Fine-grained token restricted to `konstk1/aisle-flow` with `Issues: write` only. |

The server environment is validated before database access or database
migrations run. Validation reports only invalid variable names, never values.

## Commands

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Run the development server.                      |
| `pnpm build`        | Create a production build.                       |
| `pnpm start`        | Serve a production build.                        |
| `pnpm lint`         | Run ESLint.                                      |
| `pnpm typecheck`    | Type-check without emitting files.               |
| `pnpm format`       | Apply Prettier formatting.                       |
| `pnpm format:check` | Verify formatting without writing files.         |
| `pnpm test`         | Run the Vitest unit tests.                       |
| `pnpm db:generate`  | Generate Drizzle SQL migrations from the schema. |
| `pnpm db:migrate`   | Apply generated migrations to Neon.              |

## Vercel and Neon

1. Import the repository into Vercel as a Next.js project. No custom
   `vercel.json` is required for this standard App Router deployment.
2. Add the Neon integration from the Vercel Marketplace and create or attach a
   Postgres database.
3. Set `DATABASE_URL`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, and
   `GITHUB_ISSUES_TOKEN` for Development, Preview, and Production as
   appropriate.
4. Run `pnpm db:migrate` against the intended database before deploying code
   that depends on a new migration.

The health/readiness endpoint is intentionally deferred and is not part of the
current deployment configuration.
