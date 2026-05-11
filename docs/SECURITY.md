# Security Conventions

## Environment Variables

- Local development secrets go in `.env.local`, which must never be committed.
- Production secrets must be configured in the hosting provider's secret/environment manager (Vercel Environment Variables).
- CI secrets must be configured in GitHub Actions secrets (`.github/workflows/ci.yml`).
- When adding new env vars: update all three locations — `.env.local`, Vercel, and CI secrets.
- Server-only secrets must NOT use `NEXT_PUBLIC_` prefix.

Required secrets:
`CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, `ADMIN_SESSION_SECRET`, `INTERNAL_API_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

---

## Authentication & Authorization

Every **protected user-facing** API route MUST call `currentUser()` (from `lib/get-current-user.ts`) or `requireAdmin()` (from `lib/admin-auth.ts`) before any data access.

Exceptions — these use a different verification method instead:
- **Webhook routes** — verify provider signature
- **Cron/internal routes** — verify `CRON_SECRET` or `INTERNAL_API_SECRET` bearer token
- **QStash worker routes** — verify QStash signing key
- **Public read-only routes** — must explicitly document why auth is not required

Additional ownership checks:
- Verify `session.student_id === user.id` or `exam.instructor_id === user.id` before returning or mutating resources.
- Instructor-only routes must verify `role === "instructor"` from user metadata.
- Admin routes use separate JWT auth — always call `requireAdmin()` first.

---

## Input Validation

- Validate all user input on the server with Zod schemas before use.
- Validate and escape user-generated HTML before rendering — use `sanitizeUserInput()` from `lib/sanitize.ts` only for fields that are rendered as HTML or have known injection risk.
- Do not mutate plain text input unless the specific field requires normalization (sanitizing free-form answers, markdown, code, or math input may cause data loss).
- File uploads MUST validate: extension (whitelist), MIME type, and file size.
- Never trust client-side validation alone — always re-validate on server.

---

## Rate Limiting

- All public-facing endpoints MUST use rate limiting from `lib/rate-limit.ts`.
- When adding new endpoints, choose the appropriate config and apply it.

| Config     | Limit   |
|------------|---------|
| chat       | 30/min  |
| admin      | 5/min   |
| AI         | 20/min  |
| upload     | 10/min  |
| submission | 30/min  |

---

## CORS

- CORS rules in `lib/cors.ts` — production origins set via `ALLOWED_ORIGINS` env var.
- Never add `Access-Control-Allow-Origin: *` in production.
- All API routes that accept cross-origin requests must use `getCorsHeaders()` and `handleCorsPreFlight()`.
- Handle OPTIONS preflight before any other logic (rate limit, auth, etc.).
