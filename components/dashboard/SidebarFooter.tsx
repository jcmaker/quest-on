"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings } from "lucide-react";

export function SidebarFooter() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="p-4 border-t border-sidebar-border">
      <div className="flex items-center justify-between gap-3">
        {/* 프로필 아바타 */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage
              src={user?.imageUrl}
              alt={user?.fullName || "User"}
            />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user?.firstName?.[0] ||
                user?.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
                "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.fullName || user?.firstName || "User"}
            </p>
            <p className="text-xs text-sidebar-foreground/70 truncate">
              {user?.emailAddresses[0]?.emailAddress}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => router.push("/profile")}
            aria-label="프로필 설정"
            title="프로필 설정"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleSignOut}
            aria-label="로그아웃"
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

