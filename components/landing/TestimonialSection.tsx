"use client";

// framer-motion 제거됨 - 성능 최적화를 위해 애니메이션 제거
// 이전: import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "Quest-On 도입 이후 학생들의 학습 태도가 완전히 바뀌었습니다. 단순 암기보다 문제 해결 과정에 집중하게 되었고, AI의 실시간 피드백이 교수 설계에 큰 영감을 줍니다.",
    name: "강현정 교수",
    title: "홍익대학교",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=ProfessorKang",
  },
  {
    quote:
      "기존의 온라인 시험은 부정행위 방지가 가장 큰 고민이었습니다. Quest-On의 실시간 사고 과정 트래킹 기술은 대면 시험보다 더 입체적인 데이터를 제공하여 공정한 평가를 가능하게 합니다.",
    name: "권효찬 교수",
    title: "경기과학기술대학교",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=ProfessorKwon",
  },
  {
    quote:
      "학생 개개인의 사고 과정을 데이터로 추적할 수 있다는 점이 놀랍습니다. 주관식 답변의 논리성을 AI가 분석해주니 채점 시간은 단축되고 평가는 훨씬 더 정교해졌습니다.",
    name: "최인대 교수",
    title: "경기과학기술대학교",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=ProfessorChoi",
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
      className={`w-full py-24 lg:py-32 ${isDark ? "bg-black" : "bg-white"}`}
    >
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-20 max-w-4xl text-center">
          <h2
            className={`text-3xl font-bold tracking-tight md:text-5xl lg:text-5xl animate-fade-in-up-sm ${
              isDark ? "text-white" : "text-[#1F1F1F]"
            }`}
          >
            이미 수많은 교육 현장에서
            <br />
            혁신이 시작되었습니다.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className={`group flex flex-col rounded-[2.5rem] p-10 border transition-all hover:shadow-2xl hover:-translate-y-2 animate-fade-in-up-sm ${
                isDark
                  ? "bg-zinc-900/40 border-zinc-800"
                  : "bg-white border-zinc-200 shadow-xl shadow-zinc-200/50"
              }`}
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div className="mb-8">
                <Quote
                  className={`w-10 h-10 transition-colors duration-300 ${
                    isDark
                      ? "text-blue-500/20 group-hover:text-blue-500"
                      : "text-blue-600/10 group-hover:text-blue-600"
                  }`}
                />
              </div>

              <blockquote className="flex-1">
                <p
                  className={`text-lg lg:text-xl leading-relaxed mb-12 font-bold tracking-tight ${
                    isDark ? "text-zinc-300" : "text-[#1F1F1F]"
                  }`}
                >
                  &quot;{testimonial.quote}&quot;
                </p>
              </blockquote>

              <div
                className="flex items-center gap-5 border-t pt-8"
                style={{
                  borderColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.05)",
                }}
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-4 ring-blue-500/10 shadow-lg">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="h-full w-full object-cover grayscale"
                  />
                </div>
                <div>
                  <div
                    className={`text-lg font-bold tracking-tight ${
                      isDark ? "text-white" : "text-[#1F1F1F]"
                    }`}
                  >
                    {testimonial.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] opacity-60">
                    {testimonial.title}
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
