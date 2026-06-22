# Agent Guidance

## Package management

- Use `pnpm` for dependency installation and package scripts. Use `pnpm dlx` to run package executables. Keep `pnpm-lock.yaml` authoritative; do not create npm or Yarn lockfiles.

## Issue tracking

- Use GitHub Issues in `konstk1/aisle-flow` to track bugs and work; do not create a separate local ticket system.
- Treat in-app bug reports as GitHub issues and apply the `reported-in-app` label.
- When a pull request resolves an issue, include `Closes #<issue-number>` in its description.
