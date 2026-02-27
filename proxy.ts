import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/join",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/legal(.*)",
  "/onboarding",
]);

// Admin routes use separate HMAC-token auth, not Clerk
const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)",
]);

// Instructor-only page routes
const isInstructorPageRoute = createRouteMatcher([
  "/instructor(.*)",
]);

// Student-only page routes
const isStudentPageRoute = createRouteMatcher([
  "/student(.*)",
]);

export const proxy = clerkMiddleware(async (auth, req) => {
  // Admin routes bypass Clerk auth (they use HMAC token)
  if (isAdminRoute(req)) {
    return NextResponse.next();
  }

  // Public routes don't require auth
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // All other routes require Clerk authentication
  const { userId, sessionClaims } = await auth.protect();

  // Role-based page route protection
  // NOTE: Clerk JWT에 unsafeMetadata가 포함되지 않으면 role은 undefined.
  // role이 undefined일 때는 리다이렉트하지 않고 페이지 레벨 체크(currentUser/useUser)에 위임.
  // Clerk Dashboard → Sessions → Customize session token에서
  // { "unsafeMetadata": "{{user.unsafe_metadata}}" } 설정 시 proxy 레벨 보호도 작동.
  const userRole =
    (sessionClaims?.unsafeMetadata as Record<string, unknown>)?.role as string | undefined;

  if (userRole) {
    if (isInstructorPageRoute(req) && userRole !== "instructor") {
      return NextResponse.redirect(new URL("/student", req.url));
    }

    if (isStudentPageRoute(req) && userRole === "instructor") {
      return NextResponse.redirect(new URL("/instructor", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
