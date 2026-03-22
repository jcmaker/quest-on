"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { SignedIn, SignedOut, useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, LayoutDashboard, Plus, FileEdit } from "lucide-react";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { UserMenu } from "@/components/auth/UserMenu";
import { getEmoji3dPath } from "@/lib/emoji-3d";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user } = useUser();

  const navigationItems = [
    {
      title: "대시보드",
      href: "/instructor",
      icon: LayoutDashboard,
      active: pathname === "/instructor",
    },
    {
      title: "새 시험 생성",
      href: "/instructor/new",
      icon: Plus,
      active: pathname === "/instructor/new",
    },
    {
      title: "과제 만들기",
      href: "/instructor/assignment/new",
      icon: FileEdit,
      active: pathname === "/instructor/assignment/new",
    },
  ];

  // Get user role from metadata
  const userRole = (user?.unsafeMetadata?.role as string) || "student";

  // Scroll-based header hide/show
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const handleScroll = () => {
      const currentY = main.scrollTop;
      if (currentY > lastScrollY.current && currentY > 60) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentY;
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  // Redirect non-instructors or users without role
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Role이 설정되지 않은 경우 onboarding으로 리다이렉트
      if (!user?.unsafeMetadata?.role) {
        router.push("/onboarding");
        return;
      }
      // Role이 instructor가 아닌 경우 student 페이지로 리다이렉트
      if (userRole !== "instructor") {
        router.push("/student");
      }
    }
  }, [isLoaded, isSignedIn, userRole, user, router]);

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        <div className="flex items-center justify-center h-screen p-4">
          <Card className="w-full max-w-md border-0 bg-card/85 shadow-xl backdrop-blur-sm">
            <CardHeader className="text-center space-y-4">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary">
                <GraduationCap
                  className="w-8 h-8 text-primary-foreground"
                  aria-hidden="true"
                />
                <Image
                  src={getEmoji3dPath("graduation")}
                  alt="졸업 이모티콘"
                  width={52}
                  height={52}
                  className="pointer-events-none absolute -bottom-4 -right-4 h-12 w-12 rounded-xl border border-border/50 bg-background/90 p-1 shadow-sm"
                />
              </div>
              <CardTitle className="text-xl font-bold">
                로그인이 필요합니다
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                강사 페이지에 접근하려면 로그인해주세요
              </p>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <Button
                onClick={() => router.replace("/sign-in")}
                className="w-full min-h-[44px]"
                aria-label="강사로 로그인"
              >
                강사로 로그인
              </Button>
            </CardContent>
          </Card>
        </div>
      </SignedOut>

      <SignedIn>
        <SidebarProvider
          defaultOpen={true}
          className="overflow-x-hidden"
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "4rem",
            } as React.CSSProperties
          }
        >
          <Sidebar
            side="left"
            variant="sidebar"
            collapsible="icon"
            className="overflow-visible"
          >
            <DashboardSidebar
              homeHref="/instructor"
              navItems={navigationItems}
              userId={user?.id}
            />
          </Sidebar>

          <SidebarInset className="min-w-0 overflow-x-hidden">
            <header className={`sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm transition-transform duration-300 lg:hidden ${headerVisible ? "translate-y-0" : "-translate-y-full"}`}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Image src="/qlogo_icon.png" alt="Quest-On" width={28} height={28} />
                  <Image
                    src={getEmoji3dPath("presentation")}
                    alt="강사 대시보드"
                    width={38}
                    height={38}
                    className="h-8 w-8 rounded-lg border border-border/50 bg-card/90 p-0.5 shadow-sm"
                  />
                </div>
                <UserMenu />
              </div>
            </header>
            <main
              ref={mainRef}
              className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-background pb-20 lg:pb-0"
            >
              {children}
            </main>
          </SidebarInset>

          <MobileBottomNav navItems={navigationItems} />
        </SidebarProvider>
      </SignedIn>
    </div>
  );
}
