import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/((?!.+\\.[\\w]+$|_next).*)",
  "/",
  "/(api|trpc)((?!.*upload).*)", // /api/upload 제외
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/demo",
  "/join",
  "/admin/login",
  "/api/chat",
  "/api/feedback",
  "/api/admin/auth",
  "/api/upload", // route 핸들러에서 자체 인증 체크
  "/api/universities/search", // 학교 검색 API
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export const proxy = clerkMiddleware(async (auth, req) => {
  // /api/upload는 route 핸들러에서 자체 인증 체크하므로 proxy에서 제외
  if (req.nextUrl.pathname === "/api/upload") return;

  if (isPublicRoute(req)) return;
  if (isProtectedRoute(req)) {
    const session = await auth();
    if (!session) {
      return Response.redirect(new URL("/sign-in", req.url));
    }
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
