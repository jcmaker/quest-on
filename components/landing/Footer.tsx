"use client";

import { Mail, Phone } from "lucide-react";
import Image from "next/image";

interface FooterProps {
  mode?: "light" | "dark";
}

const COLORS = {
  light: {
    bg: "#FFFFFF",
    text: "#1F1F1F",
    textSec: "#52525B", // Improved contrast: changed from #6B7280 to #52525B (zinc-600) for better WCAG AA compliance
    border: "#E5E5E5",
  },
  dark: {
    bg: "#0A0A0A",
    text: "#E4E4E4",
    textSec: "#A1A1AA",
    border: "rgba(255, 255, 255, 0.1)",
  },
} as const;

const FOOTER_LINKS = {
  제품: [
    { label: "메인", href: "#hero" },
    { label: "고객 후기", href: "#features" },
    { label: "파트너십", href: "#partners" },
    { label: "무료로 시작하기", href: "/sign-up" },
  ],
  //   리소스: [
  //     { label: "시작 가이드", href: "/docs/getting-started" },
  //     { label: "업데이트 소식", href: "/changelog" },
  //     { label: "API 문서", href: "/docs/api" },
  //     { label: "도움말 센터", href: "/help" },
  //     { label: "시스템 현황", href: "/status" },
  //   ],
  //   회사: [
  //     { label: "팀 소개", href: "/about" },
  //     { label: "블로그", href: "/blog" },
  //     { label: "채용 안내", href: "/careers" },
  //     { label: "파트너십", href: "/partners" },
  //     { label: "문의하기", href: "mailto:questonkr@gmail.com" },
  //   ],
  법적고지: [
    { label: "이용약관", href: "/legal/terms" },
    { label: "개인정보처리방침", href: "/legal/privacy" },
    { label: "데이터 보안", href: "/legal/security" },
    { label: "쿠키 정책", href: "/legal/cookies" },
  ],
} as const;

export default function Footer({ mode = "light" }: FooterProps) {
  const colors = COLORS[mode];
  const isDark = mode === "dark";

  const handleContactClick = () => {
    window.location.href = "mailto:questonkr@gmail.com?subject=문의사항";
  };

  const footerLinksEntries = Object.entries(FOOTER_LINKS);
  //   const linksPerColumn = Math.ceil(footerLinksEntries.length / 2);

  return (
    <footer
      className={`relative w-full py-8 ${
        isDark
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950/50"
          : "bg-gradient-to-br from-slate-50 via-white to-slate-50/50"
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8 max-w-7xl">
        <div className="flex flex-wrap lg:flex-nowrap gap-8 lg:gap-12 mb-12 lg:mb-16">
          {/* Left Section - Logo & Contact */}
          <div className="w-full lg:w-1/2">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <Image
                src="/qlogo_icon.png"
                alt="Quest-On Logo"
                width={40}
                height={40}
                className="h-10 w-10"
                loading="lazy"
              />
              <span
                className="font-bold text-2xl tracking-tight"
                style={{ color: colors.text }}
              >
                Quest-On
              </span>
            </div>

            {/* Description */}
            <p
              className="text-base lg:text-lg mb-8 leading-[1.6] max-w-lg"
              style={{ 
                color: colors.textSec,
                letterSpacing: "-0.3px"
              }}
            >
              AI와 함께하는 차세대 교육 평가 시스템.
              <br />
              사고의 과정을 데이터로 증명합니다.
            </p>

            {/* Contact Button */}
            <button
              onClick={handleContactClick}
              className="px-8 py-3.5 rounded-full font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, #3b82f6 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)",
                backgroundSize: "200% 200%",
                animation: "gradient-shift-blue-purple 4s ease infinite",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(135deg, #2563eb 0%, #4f46e5 25%, #7c3aed 50%, #9333ea 75%, #7e22ce 100%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "linear-gradient(135deg, #3b82f6 0%, #6366f1 25%, #8b5cf6 50%, #a855f7 75%, #9333ea 100%)";
              }}
            >
              <Mail className="w-5 h-5" />
              문의하기
            </button>

            {/* Contact Info */}
            <div className="mt-6 space-y-2">
              <p
                className="text-sm font-medium flex items-center gap-2"
                style={{ color: colors.textSec }}
              >
                <Mail className="w-4 h-4 font-bold" />:{" "}
                <a
                  href="mailto:questonkr@gmail.com"
                  className="hover:underline"
                  style={{ color: colors.text }}
                >
                  questonkr@gmail.com
                </a>
              </p>
              <p
                className="text-sm font-medium flex items-center gap-2"
                style={{ color: colors.textSec }}
              >
                <Phone className="w-4 h-4 font-bold" />:{" "}
                <a
                  href="tel:010-5096-8981"
                  className="hover:underline"
                  style={{ color: colors.text }}
                >
                  010-5096-8981
                </a>
              </p>
            </div>
          </div>

          {/* Right Section - Links */}
          <div className="w-full lg:w-1/2">
            <div className="grid grid-cols-2 gap-8 lg:gap-12">
              {footerLinksEntries.map(([category, links]) => (
                <div key={category}>
                  <h5
                    className="text-xs font-bold uppercase tracking-widest mb-6 opacity-60"
                    style={{ color: colors.text }}
                  >
                    {category}
                  </h5>
                  <ul className="space-y-3">
                    {links.map((link) => {
                      const isAnchorLink = link.href.startsWith("#");
                      const handleClick = (
                        e: React.MouseEvent<HTMLAnchorElement>
                      ) => {
                        if (isAnchorLink) {
                          e.preventDefault();
                          const targetId = link.href.substring(1);
                          const element = document.getElementById(targetId);
                          if (element) {
                            element.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }
                        }
                      };

                      return (
                        <li key={link.label}>
                          <a
                            href={link.href}
                            onClick={handleClick}
                            className="text-sm font-medium transition-all cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                            style={{ color: colors.textSec }}
                          >
                            {link.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar - Copyright */}
        <div
          className="pt-8 border-t"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
          }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div
              className="text-sm font-medium"
              style={{ color: colors.textSec }}
            >
              Copyright © 2025{" "}
              <span className="font-semibold" style={{ color: colors.text }}>
                Quest-On Inc.
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
