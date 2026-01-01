"use client";

import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";

interface CTASectionProps {
    mode?: "light" | "dark";
    onCtaClick?: () => void;
}

export default function CTASection({ mode = "light", onCtaClick }: CTASectionProps) {
    const isDark = mode === "dark";

    return (
        <section className={`py-32 px-6 relative overflow-hidden ${isDark ? "bg-black" : "bg-white"}`}>
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl aspect-square bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto max-w-5xl text-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="space-y-8"
                >
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${isDark ? "bg-zinc-900 border-zinc-800 text-blue-400" : "bg-blue-50 border-blue-100 text-blue-600"}`}>
                        <Zap className="w-3 h-3 fill-current" />
                        교육의 새로운 패러다임
                    </div>

                    <h2 className={`text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] ${isDark ? "text-white" : "text-[#1F1F1F]"}`}>
                        지금 바로 Quest-On으로<br />
                        교육 성과를 증명하세요.
                    </h2>

                    <p className={`text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                        암기 평가를 넘어 사고의 과정을 데이터로 기록합니다.<br />
                        무료로 시작하고 혁신적인 평가 시스템을 경험해 보세요.
                    </p>


                    <div className="pt-6">
                        <button
                            onClick={onCtaClick}
                            className={`group relative inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold rounded-full transition-all hover:scale-105 active:scale-95 ${isDark
                                ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-[0_15px_30px_rgba(0,0,0,0.15)]"
                                }`}
                        >
                            무료로 시작하기
                            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    <div className="pt-8 flex flex-wrap justify-center gap-8 opacity-40 grayscale group-hover:grayscale-0 transition-all">
                        <span className="text-sm font-bold tracking-widest uppercase">No Credit Card Required</span>
                        <span className="text-sm font-bold tracking-widest uppercase">Instant Setup</span>
                        <span className="text-sm font-bold tracking-widest uppercase">AI-Powered</span>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
