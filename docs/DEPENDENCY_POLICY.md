# Dependency Policy

- No pre-release packages in production (current exception: `@base-ui-components/react` — to be replaced).
- Run `npm audit` before merging dependency updates.
- Prefer built-in or already-installed solutions over adding new packages.
- New packages require justification — check if existing deps already solve the problem first.
