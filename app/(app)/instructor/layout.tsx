"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { useAppUser } from "@/components/providers/AppAuthProvider";
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
import AgentPanel, { AgentPanelGap } from "@/components/agent/AgentPanel";
import { AgentFab } from "@/components/agent/AgentFab";
import { AgentRunControllerProvider } from "@/components/agent/AgentRunController";
import { AgentPresenceProvider } from "@/components/agent/AgentPresenceProvider";
import { AgentPanelProvider } from "@/components/agent/AgentPanelProvider";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded, user, profile } = useAppUser();

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

  const userRole = profile?.role ?? "student";
  const isAuthoringRoute =
    pathname === "/instructor/new" ||
    pathname === "/instructor/assignment/new";

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
      if (!profile?.role) {
        router.push("/onboarding");
        return;
      }
      if (userRole !== "instructor") {
        router.push("/student");
      }
    }
  }, [isLoaded, isSignedIn, userRole, profile, router]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
              <GraduationCap
                className="w-8 h-8 text-primary-foreground"
                aria-hidden="true"
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
    );
  }

  return (
    // AgentPanelProvider가 SidebarProvider를 감싸도록 배치
    <AgentRunControllerProvider>
      <AgentPresenceProvider>
        <AgentPanelProvider>
          <div className="min-h-screen bg-background">
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
                {/* 모바일 전용 헤더 — 데스크톱에선 숨김 */}
                <header
                  className={`sticky top-0 z-40 lg:hidden bg-background/80 backdrop-blur-sm border-b border-border transition-transform duration-300 ${
                    headerVisible ? "translate-y-0" : "-translate-y-full"
                  }`}
                >
                  <div className="px-4 py-3 flex items-center justify-between">
                    <Image
                      src="/qlogo_icon.png"
                      alt="Quest-On"
                      width={28}
                      height={28}
                    />
                    <UserMenu />
                  </div>
                </header>
                <main
                  ref={mainRef}
                  className={`flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-background ${
                    isAuthoringRoute ? "pb-0" : "pb-20 lg:pb-0"
                  }`}
                >
                  {children}
                </main>
              </SidebarInset>

              {/*
               * AgentPanelGap — SidebarInset의 flex 형제로 위치해 본문을 밀어낸다.
               * 데스크톱 전용(md:block). open 상태에 따라 너비 transition.
               */}
              <AgentPanelGap />

              {!isAuthoringRoute && (
                <MobileBottomNav navItems={navigationItems} showAgentButton />
              )}
            </SidebarProvider>

            {/* 실제 패널 본체 — 데스크톱: fixed 우측, 모바일: Sheet 오버레이 */}
            <AgentPanel />

            {/* 우측 하단 고정 플로팅 버튼 — 패널 열기 (데스크톱/태블릿) */}
            <AgentFab />
          </div>
        </AgentPanelProvider>
      </AgentPresenceProvider>
    </AgentRunControllerProvider>
  );
}
