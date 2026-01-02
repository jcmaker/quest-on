"use client";

// framer-motion 제거됨 - 성능 최적화를 위해 애니메이션 제거 (실제로 사용되지 않았음)
// 이전: import { motion } from "framer-motion";

const PARTNERS = [
  { name: "홍익대학교", logo: "Hongik University" },
  { name: "경기과학기술대학교", logo: "GTEC" },
];

export default function LogoCloud({
  mode = "light",
}: {
  mode?: "light" | "dark";
}) {
  const isDark = mode === "dark";

  return (
    <section
      id="partners"
      className={`min-h-[400px] lg:min-h-[500px] flex items-center py-12 lg:py-16 ${
        isDark ? "bg-black" : "bg-white"
      }`}
    >
      <div className="container mx-auto px-6 w-full">
        <div className="flex flex-col items-center justify-center gap-8">
          <p
            className={`text-xs font-bold uppercase tracking-[0.2em] ${
              isDark ? "text-zinc-500" : "text-zinc-400"
            }`}
          >
            함께하는 혁신 파트너
          </p>
          <div className="flex flex-wrap items-center justify-center gap-12 md:gap-24 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
            {PARTNERS.map((partner) => (
              <div
                key={partner.name}
                className="flex flex-col items-center gap-3 group"
              >
                <div
                  className={`text-2xl md:text-3xl font-black tracking-tighter ${
                    isDark ? "text-white" : "text-[#1F1F1F]"
                  }`}
                >
                  {partner.name}
                </div>
                <div
                  className={`text-[10px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity ${
                    isDark ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  {partner.logo}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
