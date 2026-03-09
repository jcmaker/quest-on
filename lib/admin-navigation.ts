import type { LucideIcon } from "lucide-react";
import { Shield, FileText, Bot } from "lucide-react";

export interface AdminNavigationItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItem[] = [
  {
    title: "대시보드",
    href: "/admin",
    icon: Shield,
  },
  {
    title: "AI 사용량",
    href: "/admin/ai-usage",
    icon: Bot,
  },
  {
    title: "로그 기록",
    href: "/admin/logs",
    icon: FileText,
  },
];
