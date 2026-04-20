# Quest-On Development Guide

## Project Overview

Quest-On is an AI-powered exam/assessment platform. Instructors create exams, students take them with AI tutoring, AI auto-grades, instructors review.

**Stack:** Next.js 16 (App Router) | React 19 | TypeScript 5 (strict) | Tailwind 4 | Prisma + Supabase PostgreSQL | Clerk Auth | OpenAI API | Upstash Redis | Vercel

**Architecture:** See `ARCHITECTURE.md` for full system map (routes, schema, integrations, security findings).

---

## Security Protocols

### Environment Variables
- NEVER hardcode secrets in source code. All secrets go in `.env.local` (excluded from git)
- Server-only secrets must NOT use `NEXT_PUBLIC_` prefix
- Required secrets: `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, `ADMIN_SESSION_SECRET`, `INTERNAL_API_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Grading pipeline (chained QStash jobs) additionally requires:
  - `QSTASH_TOKEN` — QStash publish credential
  - `QSTASH_CURRENT_SIGNING_KEY` — QStash signature verification
  - `QSTASH_NEXT_SIGNING_KEY` — QStash signing key rotation
  - `CRON_SECRET` — bearer token that `/api/cron/grading-sweep` validates
  - **Worker URL (pick ONE)** — QStash must POST back to a stable, production domain. Priority: `QSTASH_WORKER_BASE_URL` > `NEXT_PUBLIC_APP_URL` > `VERCEL_URL` (last-resort fallback, logs a warning because it's a deployment-specific preview URL that changes on every deploy).
    - Recommended on Vercel: set `NEXT_PUBLIC_APP_URL=https://quest-on.app` (or your stable domain). Otherwise set `QSTASH_WORKER_BASE_URL` to the same.
    - For local dev through a tunnel (e.g. ngrok), set `QSTASH_WORKER_BASE_URL=https://<your-tunnel>.ngrok-free.app`.
  - Without QStash configured, grading will run in-process inline ONLY when not on Vercel (dev). In Vercel/production, missing QStash causes the trigger to fail loudly with `reason: "qstash_not_configured"` rather than silently drop grading.
  - **Emergency switches:**
    - `GRADING_SWEEP_DISABLED=1` — flips `/api/cron/grading-sweep` into a no-op (returns 200 with `{disabled: true}`). Use when a stuck session is causing the sweeper to burn invocations; flip back to unset once root cause is fixed.
    - Sweeper has built-in safeguards: per-session 60-min cooldown (`last_swept_at`), 3-attempt cap (`sweep_attempts`), 10-session-per-run limit, and auto-heal for sessions that already have a complete `ai_summary`. After 3 attempts a session is force-marked `failed` and requires the manual `PUT /api/session/[sessionId]/grade` retry endpoint.
- When adding new env vars: update `.env.local`, Vercel env vars, AND CI secrets in `.github/workflows/ci.yml`

### Authentication & Authorization
- Every API route MUST call `currentUser()` (from `lib/get-current-user.ts`) or `requireAdmin()` (from `lib/admin-auth.ts`) before any data access
- Check resource ownership: verify `session.student_id === user.id` or `exam.instructor_id === user.id` before returning data
- Instructor-only routes must verify `role === "instructor"` from user metadata
- Admin routes use separate JWT auth — always call `requireAdmin()` first

### Input Validation
- All API route inputs MUST be validated with Zod schemas before use
- User-provided text MUST be sanitized with `sanitizeUserInput()` from `lib/sanitize.ts`
- File uploads MUST validate: extension (whitelist), MIME type, and file size
- Never trust client-side validation alone — always re-validate on server

### Rate Limiting
- All public-facing endpoints MUST use rate limiting from `lib/rate-limit.ts`
- Configs: chat (30/min), admin (5/min), AI (20/min), upload (10/min), submission (30/min)
- When adding new endpoints, add a rate limit config and apply it

### CORS
- CORS rules in `lib/cors.ts` — production origins set via `ALLOWED_ORIGINS` env var
- Never add `Access-Control-Allow-Origin: *` in production
- All API routes that accept cross-origin requests must use `getCorsHeaders()` and `handleCorsPreFlight()`

---

## Coding Standards

### API Route Structure
Every API route should follow this pattern:
1. Rate limit check
2. Auth check (`currentUser()` / `requireAdmin()`)
3. Input validation (Zod schema)
4. Ownership/authorization check
5. Business logic
6. AI event tracking (if AI call involved)
7. Return response with appropriate status code

### Error Handling
- Return generic error messages to clients (never expose stack traces or internal details)
- Use `console.error()` for server-side logging (the only allowed console method per ESLint config)
- Detailed error info only in `NODE_ENV === "development"`
- Always return appropriate HTTP status codes (400 for bad input, 401 for unauth, 403 for forbidden, 404 for not found, 429 for rate limited)

### Database
- Use Prisma client (`lib/prisma.ts`) for all database queries — never raw SQL in API routes
- SQL migrations go in `/database` directory, numbered sequentially
- Always add appropriate indexes for new query patterns
- Use cascade deletes for child records (configured in Prisma schema)
- Unique constraints prevent duplicate data (e.g., `[session_id, q_idx]`)

### AI Integration
- All OpenAI calls MUST be tracked in the `ai_events` table (tokens, latency, cost)
- Use models defined in env vars (`AI_MODEL`, `AI_MODEL_HEAVY`) — never hardcode model names
- Implement retry logic for 429/5xx responses (max 3 attempts)
- Rate limit AI endpoints to prevent runaway costs

### State Management
- Server state: React Query with appropriate staleTime (see `components/providers/QueryProvider.tsx`)
- Query keys defined in `lib/query-keys.ts` — always use these, never ad-hoc strings
- No Redux/Zustand — use React Query for server cache, React state/context for UI state
- Custom hooks in `/hooks` directory for reusable state patterns

### File Organization
- Pages: `app/(app)/[role]/...` with route groups
- API routes: `app/api/[domain]/route.ts`
- Components: `components/[domain]/ComponentName.tsx`
- Hooks: `hooks/use-[name].ts`
- Utilities: `lib/[name].ts`
- Database migrations: `database/[number]_description.sql`

---

## Testing Requirements

- **Unit tests** (`__tests__/`): Vitest — test business logic, utilities, validation schemas
- **E2E tests** (`e2e/`): Playwright — test critical user flows (exam creation, taking, grading)
- **API tests**: Playwright API integration tests against mock server
- When adding new API routes: add at minimum a unit test for the Zod schema and an integration test
- When fixing bugs: add a regression test that reproduces the bug first

---

## Dependency Policy

- No pre-release packages in production (current exception: `@base-ui-components/react` — to be replaced)
- Audit `npm audit` before merging dependency updates
- Prefer built-in/existing solutions over adding new packages
- New packages require justification — check if existing deps already solve the problem

---

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how