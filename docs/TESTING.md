# Testing Conventions

## Test Types

| Type       | Tool       | Location       | Scope                                          |
|------------|------------|----------------|------------------------------------------------|
| Unit       | Vitest     | `__tests__/`   | Business logic, utilities, Zod schemas         |
| E2E        | Playwright | `e2e/`         | Critical user flows (exam creation, taking, grading) |
| API        | Playwright | `e2e/`         | Integration tests against mock server          |

---

## Rules

- When adding a new API route: add at minimum a unit test for the Zod schema and an integration test.
- When fixing a bug: add a regression test that reproduces the bug first, then fix it.
- Do not mark work complete without running the relevant test suite.

---

## Commands

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Unit tests
npm run test -- --run

# E2E tests
npx playwright test
```
