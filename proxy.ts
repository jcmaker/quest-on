import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isPublicRoute = (pathname: string) =>
  [
    "/",
    "/join",
    "/sign-in",
    "/sign-up",
    "/onboarding",
    "/instructor-pending",
    "/auth/callback",
  ].some((r) => pathname === r || pathname.startsWith(r + "/"));

const isAdminRoute = (pathname: string) =>
  pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

const isInstructorRoute = (pathname: string) =>
  pathname.startsWith("/instructor");

const isStudentRoute = (pathname: string) => pathname.startsWith("/student");

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Supabase 세션 쿠키 갱신
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 어드민 라우트는 별도 인증 (admin-auth.ts)
  if (isAdminRoute(pathname)) return response;

  // 공개 라우트는 통과
  if (isPublicRoute(pathname)) return response;

  // 미인증 → 로그인 페이지
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // profiles 테이블에서 role/status 읽기
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;
  const isPending = profile?.status === "pending";

  if (isInstructorRoute(pathname)) {
    if (role !== "instructor") {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    if (isPending) {
      return NextResponse.redirect(new URL("/instructor-pending", request.url));
    }
  }

  if (isStudentRoute(pathname)) {
    if (role === "instructor") {
      return NextResponse.redirect(new URL("/instructor", request.url));
    }
    if (!role) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
