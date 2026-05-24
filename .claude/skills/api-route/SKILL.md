---
name: api-route
description: Use when adding or modifying API routes under app/api/. Provides Quest-On's 7-step route checklist (rate-limit → auth → Zod → ownership → logic → AI tracking → response) and links the project-specific helpers (lib/rate-limit, lib/get-current-user, lib/api-response, lib/ai-tracking, lib/supabase-server).
---

# API Route Skill

## When to use
Adding a new `app/api/**/route.ts` handler, or modifying an existing one (new method, new field, changed auth). Skip for pure refactors that don't touch the request/response contract.

## 7-step checklist
Run through these in order. Skipping a step is the most common source of P0 bugs.

1. **CORS preflight** — only for cross-origin (e.g. embedded). `export async function OPTIONS(req) { return handleCorsPreFlight(req); }` from `lib/cors.ts`.
2. **Rate limit** — `await checkRateLimitAsync("<route-slug>:<userId-or-ip>", RATE_LIMITS.<bucket>)` from `lib/rate-limit.ts`. Buckets: `chat`, `ai`, `general`, `upload`, `sessionRead`, `examControl`, `submission`, `adminLogin`, `pasteLog`, `finalAnswerSave`, `publicSearch`.
3. **Auth** — `await currentUser()` from `lib/get-current-user.ts` (re-export of `lib/supabase-auth.ts`), or `await requireAdmin()` from `lib/admin-auth.ts`, or `verifySignatureAppRouter(handler)` for QStash webhooks. Return 401 on `null`.
4. **Validation (Zod)** — define schema at module scope, parse `await request.json()` with `safeParse`. Never trust raw body. Path params: `validateUUID(id, "examId")` from `lib/validate-params.ts`.
5. **Ownership check** — for any resource read/mutate, compare `user.id` against the row's owner column (`instructor_id`, `student_id`). Return 403 on mismatch.
6. **Business logic** — `getSupabaseServer()` from `lib/supabase-server.ts`. Service role; bypasses RLS. No raw SQL. No singleton — call per-invocation.
7. **AI tracking** — never call `openai.*` directly. Wrap with `callTrackedChatCompletion` / `callTrackedResponse` / `callTrackedOpenAI` from `lib/ai-tracking.ts`. SSE streams must insert `ai_events` manually on completion.
8. **Response** — `successJson(data?, status?)` / `errorJson(code, message, status, details?)` from `lib/api-response.ts`. Status codes: 400 / 401 / 403 / 404 / 409 / 429 / 500. Log errors via `logError(msg, err, { path })` from `lib/logger.ts`.

Webhook, cron, and `/api/internal/*` routes substitute step 3 with signature verification (see `docs/SECURITY.md`).

## Template

```ts
// app/api/example/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { validateUUID } from "@/lib/validate-params";

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "running", "closed"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Authentication required", 401);

    // 2. Rate limit (keyed by user.id)
    const rl = await checkRateLimitAsync(
      `example-patch:${user.id}`,
      RATE_LIMITS.general
    );
    if (!rl.allowed) return errorJson("RATE_LIMITED", "Too many requests", 429);

    // 3. Validate path param + body
    const { id } = await params;
    const idCheck = validateUUID(id, "id");
    if (idCheck) return idCheck;

    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) return errorJson("INVALID_INPUT", "Invalid input", 400);

    // 4. Ownership check
    const supabase = getSupabaseServer();
    const { data: row, error: fetchErr } = await supabase
      .from("exams")
      .select("instructor_id")
      .eq("id", id)
      .single();
    if (fetchErr || !row) return errorJson("NOT_FOUND", "Not found", 404);
    if (row.instructor_id !== user.id) {
      return errorJson("FORBIDDEN", "Access denied", 403);
    }

    // 5. Business logic
    const { error: updateErr } = await supabase
      .from("exams")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) throw updateErr;

    // 6. Response
    return successJson({ updated: true });
  } catch (error) {
    logError("PATCH /api/example/[id] failed", error, {
      path: "/api/example/[id]",
    });
    return errorJson("INTERNAL_ERROR", "Update failed", 500);
  }
}
```

## Common mistakes
- **Rate limit missing.** Public routes without `checkRateLimitAsync` are abuse vectors. The `api-rate-limit-check` PostToolUse hook warns on this, but don't rely on it.
- **Ownership check missing.** Auth proves *who*, ownership proves *what they may touch*. A logged-in instructor must not edit another instructor's exam.
- **Calling OpenAI directly.** Bypasses `ai_events` tracking → no token/cost telemetry, no admin dashboard data. Always go through `lib/ai-tracking.ts`.
- **`request.json()` consumed without Zod.** Type narrowing on `unknown` is not validation.
- **Error path returns raw `NextResponse.json(...)`.** Use `errorJson` so clients see the standard `{ error, message, details? }` shape.
- **Importing Prisma client.** Wrong — Quest-On uses `getSupabaseServer()`. `prisma/schema.prisma` is introspection-only; `database/NNN_*.sql` is the DDL source of truth.
