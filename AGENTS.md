# Agent Guidance

## Package management

- Use `pnpm` for dependency installation and package scripts. Use `pnpm dlx` to run package executables. Keep `pnpm-lock.yaml` authoritative; do not create npm or Yarn lockfiles.

## Issue tracking

- Use GitHub Issues in `konstk1/aisle-flow` to track bugs and work; do not create a separate local ticket system.
- Treat in-app bug reports as GitHub issues and apply the `reported-in-app` label.
- When a pull request resolves an issue, include `Closes #<issue-number>` in its description.
- Do not prepend `[codex]` to pull request titles.

## This is NOT the Next.js you know

- This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
