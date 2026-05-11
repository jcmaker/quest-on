---
name: implement-feature
description: This skill should be used when the user asks to "add a feature", "implement a screen", "build a component", "create an API route", "add a hook", "make a page", "implement X behavior", or any request that involves writing new user-facing functionality or backend endpoints. Do not use for single-line fixes or typo corrections.
---

# Implement Feature Skill

## Goal

Implement the requested feature with the smallest safe change that preserves existing architecture and satisfies Quest-On's security and coding standards.

---

## Step 1: Understand the Request

Before touching any file:

- Restate the feature in one sentence.
- Identify what type of change this is: page / component / hook / API route / data model / all of the above.
- Identify any unclear assumptions and surface them before proceeding.
- Check `PRODUCT_PHILOSOPHY.md` — does this feature have a clear user scenario? If not, flag it.

---

## Step 2: Inspect the Codebase

Find existing patterns before writing anything new.

**For API routes:**
```
app/api/[domain]/route.ts
```
Read at least one existing route in the same domain to match the exact pattern.

**For components:**
```
components/[domain]/ComponentName.tsx
```
Check if a similar component already exists. Prefer extending over creating.

**For hooks:**
```
hooks/use-[name].ts
```
Check if React Query is already fetching the same data. Reuse the query key from `lib/query-keys.ts`.

**For pages:**
```
app/(app)/[role]/...
```
Follow the existing route group structure (`instructor/`, `student/`).

**Rule:** Do not create new abstractions unless the pattern appears at least twice in the codebase.

---

## Step 3: Plan Before Writing

List:

1. Files to create or modify (be specific with paths)
2. Data flow: where does data come from → how it's fetched → how it's displayed
3. What the API contract looks like (request shape, response shape)
4. Risks: schema changes, auth edge cases, performance concerns

For anything involving 3+ files or a schema change: use plan mode before implementing.

---

## Step 4: Implement

### API Route Checklist

Every new API route MUST follow this exact order — no exceptions:

```typescript
// 1. Rate limit
const rateLimitResult = await rateLimit(req, "submission"); // pick config from lib/rate-limit.ts
if (!rateLimitResult.success) return Response.json({ error: "Too many requests" }, { status: 429 });

// 2. Auth
const user = await currentUser(); // from lib/get-current-user.ts
if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

// 3. Input validation (Zod)
const body = await req.json();
const parsed = MySchema.safeParse(body);
if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

// 4. Ownership check
const resource = await prisma.exam.findUnique({ where: { id: parsed.data.examId } });
if (!resource || resource.instructor_id !== user.id) {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

// 5. Business logic
// ...

// 6. AI event tracking (only if OpenAI is called)
// Track in ai_events table: tokens, latency, cost

// 7. Return
return Response.json({ ... }, { status: 200 });
```

**Database:** Use `lib/prisma.ts` only. Never raw SQL in route handlers.

**User text input:** Run through `sanitizeUserInput()` from `lib/sanitize.ts` before saving.

**AI calls:** Never hardcode model names — use `process.env.AI_MODEL` or `process.env.AI_MODEL_HEAVY`. Always track in `ai_events`.

**Error messages:** Return generic messages to clients. Use `console.error()` for server logs. Never expose stack traces.

---

### Component / Page Checklist

- Handle all four states: **loading**, **empty**, **error**, **success** — every time, no exceptions.
- Use React Query for server state. Query keys come from `lib/query-keys.ts` — never ad-hoc strings.
- No Redux or Zustand. Client UI state stays in `useState` / `useReducer` / context.
- Place reusable logic in `hooks/use-[name].ts`.
- Follow Tailwind 4 conventions already used in the file you're editing.
- Do not add new npm packages without justification. Check if an existing dep solves the problem first.

---

### File Placement

| What | Where |
|------|-------|
| Page | `app/(app)/instructor/...` or `app/(app)/student/...` |
| API route | `app/api/[domain]/route.ts` |
| Component | `components/[domain]/ComponentName.tsx` |
| Hook | `hooks/use-[name].ts` |
| Utility | `lib/[name].ts` |
| DB migration | `database/[NNN]_description.sql` |

---

### Schema / Migration Rules

If the feature requires a new table or column:

1. Write the migration SQL in `database/[next_number]_description.sql`.
2. Update `prisma/schema.prisma` to match.
3. Run `npx prisma generate` after schema changes.
4. Add indexes for any new query patterns (filter, sort, join columns).
5. Use cascade deletes for child records where appropriate.

---

### Avoid These Common Mistakes

- Do not add unrelated refactors in the same PR.
- Do not add `console.log` — only `console.error` is allowed by ESLint.
- Do not hardcode secrets, model names, or origin URLs.
- Do not add `Access-Control-Allow-Origin: *`.
- Do not add new env vars without updating `.env.local`, Vercel env settings, and `.github/workflows/ci.yml`.

---

## Step 5: Validate

Run in order:

```bash
# 1. Type check — must pass with zero errors
npx tsc --noEmit

# 2. Lint — must pass
npm run lint

# 3. If new API route: manually verify the 7-step order is present
# 4. If schema changed: npx prisma generate
# 5. If new test is expected: npm run test -- --run
```

If unable to run (e.g., environment not set up), state which checks were skipped and why.

---

## Step 6: Final Response

Summarize:

1. **What changed** — one sentence describing the feature implemented.
2. **Files changed** — list every file created or modified.
3. **API contract** — if a new route was added, show the request/response shape.
4. **Validation results** — typecheck passed / lint passed / tests run.
5. **Risks or TODOs** — anything left incomplete or worth watching.
