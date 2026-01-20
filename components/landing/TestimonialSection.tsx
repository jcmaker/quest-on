"use client";

// framer-motion 제거됨 - 성능 최적화를 위해 애니메이션 제거
// 이전: import { motion } from "framer-motion";
import Image from "next/image";
import { Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "단순 암기를 넘어 문제 해결에 몰입하게 만드는 변화, AI의 실시간 피드백이 교수 설계의 새로운 영감을 줍니다.",
    name: "강현정 교수",
    title: "홍익대학교",
    avatar: "/kang_pf-removebg-preview.png",
    logo: "/hongik_emblem_blue.png",
  },
  {
    quote:
      "AI 시대에 꼭 필요한 '사고 과정' 평가의 해답. 공정성과 설명 가능성을 모두 갖춘 혁신적인 플랫폼입니다.",
    name: "권효찬 교수",
    title: "경기과학기술대학교",
    avatar: "/kwan_pf-removebg-preview.png",
    logo: "/gtec_logo.svg",
  },
  {
    quote:
      "기존 시험으로는 불가능했던 '추론 과정의 가시화', Quest-On을 통해 진정한 의미의 평가가 시작되었습니다.",
    name: "최인대 교수",
    title: "경기과학기술대학교",
    avatar: "/choi_pf-removebg-preview.png",
    logo: "/gtec_logo.svg",
  },
];

export default function TestimonialSection({
  mode = "light",
}: {
  mode?: "light" | "dark";
}) {
  const isDark = mode === "dark";

  return (
    <section
      className={`w-full py-16 lg:py-24 ${isDark ? "bg-black" : "bg-white"}`}
    >
      <div className="container mx-auto px-4 lg:px-6">
        <div className="mx-auto mb-12 lg:mb-16 max-w-4xl text-center">
          <h2
            className={`text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl animate-fade-in-up-sm ${
              isDark ? "text-white" : "text-[#1F1F1F]"
            }`}
            style={{ letterSpacing: "-0.01em" }}
          >
            이미 수많은 교육 현장에서
            <br />
            혁신이 시작되었습니다.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-8">
          {TESTIMONIALS.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className={`group relative flex flex-col rounded-[2.5rem] p-8 md:p-10 border transition-all hover:shadow-2xl hover:-translate-y-2 animate-fade-in-up-sm overflow-hidden ${
                isDark
                  ? "bg-zinc-900/40 border-zinc-800"
                  : "bg-white border-zinc-200 shadow-xl shadow-zinc-200/50"
              }`}
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              {/* 이미지 배경 - 오른쪽 하단 */}
              <div className="absolute bottom-0 right-0 w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 opacity-70 group-hover:opacity-80 transition-opacity z-0">
                <div className="relative w-full h-full">
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    fill
                    className="object-contain object-right-bottom"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* 그라데이션 오버레이 - 텍스트 영역 가시성 향상 */}
              <div
                className={`absolute inset-0 z-[5] pointer-events-none ${
                  isDark
                    ? "bg-gradient-to-r from-zinc-900/90 via-zinc-900/50 to-transparent"
                    : "bg-gradient-to-r from-white/95 via-white/70 to-transparent"
                }`}
              />

              {/* 콘텐츠 영역 */}
              <div className="relative z-10 flex flex-col flex-1 min-h-[280px] md:min-h-[320px]">
                <div className="mb-6">
                  <Quote
                    className={`w-8 h-8 md:w-10 md:h-10 transition-colors duration-300 ${
                      isDark
                        ? "text-blue-500/20 group-hover:text-blue-500"
                        : "text-blue-600/10 group-hover:text-blue-600"
                    }`}
                    style={{
                      filter: isDark
                        ? "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))"
                        : "drop-shadow(0 2px 4px rgba(255, 255, 255, 1))",
                    }}
                  />
                </div>

                <blockquote className="flex-1 mb-8 pr-4 md:pr-8">
                  <p
                    className={`text-base md:text-lg lg:text-xl leading-[1.6] font-bold tracking-tight ${
                      isDark ? "text-zinc-200" : "text-[#1F1F1F]"
                    }`}
                    style={{
                      letterSpacing: "-0.3px",
                      textShadow: isDark
                        ? "0 2px 4px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.9)"
                        : "0 2px 4px rgba(255, 255, 255, 1), 0 0 12px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(255, 255, 255, 1)",
                    }}
                  >
                    &quot;{testimonial.quote}&quot;
                  </p>
                </blockquote>

                {/* 교수님 정보 - 이미지 위에 배치 */}
                <div className="mt-10 pr-4 md:pr-8">
                  <div className="flex items-center gap-3">
                    {/* 학교 로고 */}
                    <div className="relative flex-shrink-0 w-8 h-8 md:w-10 md:h-10">
                      <Image
                        src={testimonial.logo}
                        alt={testimonial.title}
                        fill
                        className="object-contain"
                        loading="lazy"
                      />
                    </div>
                    {/* 교수님 정보 텍스트 */}
                    <div className="flex-1">
                      <div
                        className={`text-base md:text-lg font-bold tracking-tight mb-1 ${
                          isDark ? "text-white" : "text-[#1F1F1F]"
                        }`}
                        style={{
                          textShadow: isDark
                            ? "0 2px 4px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.9)"
                            : "0 2px 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 0.8), 0 1px 2px rgba(255, 255, 255, 1)",
                        }}
                      >
                        {testimonial.name}
                      </div>
                      <div
                        className={`text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] ${
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        }`}
                        style={{
                          textShadow: isDark
                            ? "0 1px 2px rgba(0, 0, 0, 0.8), 0 0 6px rgba(0, 0, 0, 0.5)"
                            : "0 1px 2px rgba(255, 255, 255, 1), 0 0 6px rgba(255, 255, 255, 0.8)",
                        }}
                      >
                        {testimonial.title}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
