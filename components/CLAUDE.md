# Components — Conventions

## Scope
Applies to all React components under `components/`. UI primitives live in `components/ui/` (shadcn-style); domain components live in `components/[domain]/`.

## React 19 + Client Boundary
- Default to **server components**. Add `"use client"` only when the component needs: hooks (`useState`/`useEffect`/`useQuery`), event handlers, browser APIs, Context, or Radix/`@base-ui` interactive widgets.
- UI primitives in `components/ui/` are mostly server-safe (no `"use client"` directive) — they re-export Radix slots and accept `className`.
- When a component must be client, place the `"use client"` directive on line 1 and keep its prop surface serializable.

## Tailwind 4 Conventions
- Tailwind 4 zero-config — styles imported from `app/globals.css` via `@import "tailwindcss"`.
- Use CSS variables for colors: `bg-background`, `text-foreground`, `border-border`, `bg-primary`, etc. (defined in `:root` and `.dark` in `globals.css`). Never hardcode hex.
- Dark mode via `@custom-variant dark (&:is(.dark *))` — provided by `next-themes` (`components/providers/`). Use the `dark:` variant on classes; do not check theme in JS unless absolutely needed.
- Compose classes with `cn(...)` from `@/lib/utils` (`clsx` + `tailwind-merge`). Never concatenate class strings manually.

## Query Keys
All React Query keys MUST come from `@/lib/query-keys` (`qk.instructor.exams(userId)`, `qk.session.grade(sessionId)`, etc.). When you need a new key:
1. Add a typed factory function to `lib/query-keys.ts` under the appropriate namespace.
2. Return `as const` tuples so TypeScript narrows the key shape.
3. Never inline strings like `["foo", id]` in components or hooks.

## Data Fetching
- Server components: fetch via `getSupabaseServer()` or Prisma directly in the component body. Pass data down as props.
- Client components: use `useQuery`/`useInfiniteQuery` with keys from `qk.*`. Co-locate the hook in `hooks/use<Name>.ts` if it is reused in 2+ places.
- Mutations: use `useMutation` with `queryClient.invalidateQueries({ queryKey: qk.x(...) })` on success.
- Streaming/SSE (e.g. exam chat): keep stream parsing in a dedicated hook under `hooks/` (see `useAssignmentChat.ts`, `useExamChat.ts`).

## File Placement
- Domain components: `components/[domain]/ComponentName.tsx` (PascalCase file = PascalCase export).
- Shared UI primitives: `components/ui/[primitive].tsx` (lowercase, shadcn convention).
- Provider/context wrappers: `components/providers/`.
- Reusable hooks: `hooks/use<Name>.ts` — never inside `components/`.
