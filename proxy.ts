import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/join",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding",
]);
const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);
const isInstructorRoute = createRouteMatcher(["/instructor(.*)"]);
const isStudentRoute = createRouteMatcher(["/student(.*)"]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) return NextResponse.next();
  if (isPublicRoute(req)) return NextResponse.next();

  const { sessionClaims } = await auth.protect();

  interface CustomJwtPayload {
    unsafeMetadata?: {
      role?: "instructor" | "student" | "admin";
    };
  }

  const claims = sessionClaims as unknown as CustomJwtPayload;
  const userRole = claims.unsafeMetadata?.role;

  if (isInstructorRoute(req)) {
    if (userRole !== "instructor") {
      return NextResponse.redirect(new URL("/student", req.url));
    }
  }

  if (isStudentRoute(req)) {
    if (userRole === "instructor") {
      return NextResponse.redirect(new URL("/instructor", req.url));
    }
    if (!userRole) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
