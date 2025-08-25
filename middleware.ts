import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/((?!.+\\.[\\w]+$|_next).*)",
  "/",
  "/(api|trpc)(.*)",
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/join",
  "/api/chat",
  "/api/feedback",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
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
