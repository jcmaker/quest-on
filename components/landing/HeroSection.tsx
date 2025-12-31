"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ChevronRight,
    Play,
    MessageSquare,
    CheckCircle2,
    Sparkles,
    Brain,
    Clock,
    ShieldCheck,
    ArrowRight,
    GraduationCap,
    Plus,
    Check,
    Star,
    TriangleAlert,
    Copy
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================================================
// TYPES
// ============================================================================

interface HeroSectionProps {
    headline: React.ReactNode;
    subheadline: string;

    ctaText?: string;
    onCtaClick?: () => void;
    variant?: "default" | "cheating" | "grading" | "innovation";
    mode?: "light" | "dark";
}

// ============================================================================
// STYLES & CONFIG
// ============================================================================

const COLORS = {
    light: {
        bg: "#FFFFFF",
        text: "#1A1A1A",
        textSec: "#666666",
        primary: "#3B82F6",
        card: "#F9F9F9",
        cardBorder: "#EEEEEE",
        editorBg: "#FFFFFF",
        chromeBg: "#F7F7F7",
        glass: "backdrop-blur-md bg-white/70 border border-black/5",
        navBg: "rgba(255, 255, 255, 0.8)",
    },
    dark: {
        bg: "#0A0A0A",
        text: "#EDEDED",
        textSec: "#999999",
        primary: "#3B82F6",
        card: "#161616",
        cardBorder: "#262626",
        editorBg: "#0F0F0F",
        chromeBg: "#121212",
        glass: "backdrop-blur-md bg-white/5 border border-white/10",
        navBg: "rgba(0, 0, 0, 0.5)",
    },
} as const;

// ============================================================================
// COMPONENTS
// ============================================================================


// Number count up animation component
const CountUp = ({ to, duration = 2 }: { to: number; duration?: number }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime: number;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / (duration * 1000), 1);

            // Ease out quart
            const ease = 1 - Math.pow(1 - percentage, 4);

            setCount(Math.floor(to * ease));

            if (progress < duration * 1000) {
                animationFrame = requestAnimationFrame(animate);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [to, duration]);

    return <>{count}</>;
};

const ProductSimulation = ({ mode }: { mode: "light" | "dark" }) => {
    const colors = COLORS[mode];
    const [chatStep, setChatStep] = useState(0);

    // Sequence the chat
    useEffect(() => {
        const timers: NodeJS.Timeout[] = [];
        // Step 0: Initial (empty)
        timers.push(setTimeout(() => setChatStep(1), 1000)); // Student 1 appears
        timers.push(setTimeout(() => setChatStep(2), 2500)); // AI 1 appears
        timers.push(setTimeout(() => setChatStep(3), 4000)); // Student 2 appears
        timers.push(setTimeout(() => setChatStep(4), 5000)); // AI Analyzing appears

        return () => timers.forEach(clearTimeout);
    }, []);

    // Helper for card styling
    const cardStyle = {
        backgroundColor: colors.chromeBg,
        borderColor: colors.cardBorder,
        boxShadow: mode === 'dark' ? "0 4px 20px -5px rgba(0, 0, 0, 0.5)" : "0 10px 30px -10px rgba(0, 0, 0, 0.1)",
    };

    const innerCardStyle = {
        backgroundColor: colors.card,
        borderColor: colors.cardBorder,
    };

    return (
        <div className="relative w-full max-w-[1400px] mx-auto mt-16 lg:mt-24 perspective-1000 px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT PANEL: EXAM (3 cols) - Redesigned as Student Final Answer & Cheating Detection */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="lg:col-span-3 rounded-xl overflow-hidden border flex flex-col min-h-[400px] lg:h-[520px]"
                    style={cardStyle}
                >
                    {/* Header */}
                    <div className="h-12 border-b flex items-center justify-between px-4 bg-white/50 dark:bg-black/10" style={{ borderColor: colors.cardBorder }}>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-zinc-400" />
                            <span className="text-xs font-semibold tracking-tight">최종 답안 분석</span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden text-xs">

                        {/* Status Badges */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1 p-2 rounded-lg border bg-red-500/5 border-red-500/10">
                                <span className="text-[10px] text-red-500/70 font-medium">부정 의심</span>
                                <span className="text-sm font-bold text-red-500">4건</span>
                            </div>
                            <div className="flex flex-col gap-1 p-2 rounded-lg border bg-blue-500/5 border-blue-500/10">
                                <span className="text-[10px] text-blue-500/70 font-medium">복사 활동</span>
                                <span className="text-sm font-bold text-blue-500">10건</span>
                            </div>
                        </div>

                        {/* Suspicious Activity Box (Red) */}
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                            <div className="flex items-center gap-1.5 mb-2 text-red-600 dark:text-red-400">
                                <TriangleAlert className="w-3.5 h-3.5" />
                                <span className="font-bold text-[11px]">외부 붙여넣기 감지</span>
                            </div>
                            <div className="space-y-1 text-[10px] text-zinc-500 font-mono">
                                <div className="flex justify-between"><span>• 380자 외부 유입</span> <span>12:35</span></div>
                                <div className="flex justify-between"><span>• 112자 외부 유입</span> <span>12:38</span></div>
                            </div>
                        </div>

                        {/* Answer Content Snippet */}
                        <div className="flex-1 rounded-lg border bg-white dark:bg-zinc-900/30 p-3 space-y-2 overflow-hidden" style={{ borderColor: colors.cardBorder }}>
                            <div className="font-semibold text-zinc-400 text-[10px] uppercase tracking-wider">사고 과정 분석</div>
                            <div className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                                기술력을 시각화할 수 있는 마케팅 전략이 필요하다고 판단함...
                                <br />
                                <span className="bg-red-500/10 text-red-600 dark:text-red-400 px-1 rounded box-decoration-clone">
                                    프리미엄 세그먼트를 타겟으로 고가 정책을 유지하면서도...
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>



                {/* CENTER PANEL: CHAT HISTORY (5 cols) */}
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.5 }}
                    className="lg:col-span-5 rounded-xl overflow-hidden border flex flex-col min-h-[500px] lg:h-[720px] shadow-2xl z-10 relative"
                    style={{
                        backgroundColor: colors.bg,
                        boxShadow: mode === 'dark' ? "0 20px 40px -10px rgba(0, 0, 0, 0.8)" : "0 20px 40px -10px rgba(0, 0, 0, 0.1)",
                        borderColor: colors.cardBorder
                    }}
                >
                    {/* Header */}
                    <div className="h-14 border-b flex items-center justify-between px-5 bg-white dark:bg-zinc-900/50" style={{ borderColor: colors.cardBorder }}>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm font-semibold tracking-tight">AI 사고 평가 과정</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                            <Sparkles className="w-3 h-3 text-blue-500" />
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">AI Agent</span>
                        </div>
                    </div>

                    {/* Chat Content */}
                    <div className="flex-1 p-6 overflow-y-auto space-y-8 font-sans">

                        {/* Message 1: Student */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="flex justify-end gap-3"
                        >
                            <div className="flex flex-col items-end max-w-[85%]">
                                <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-3 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed border border-zinc-200 dark:border-zinc-700">
                                    경쟁사 대비 제품의 경량화 수준이 어느 정도야?
                                </div>
                                <span className="text-[10px] text-zinc-500 mt-1.5 mr-1">오전 1:08</span>
                            </div>
                        </motion.div>

                        {/* Message 2: AI */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.2 }}
                            className="flex justify-start gap-3"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex flex-col items-start max-w-[85%]">
                                <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-700 px-4 py-3 rounded-2xl rounded-tl-sm text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 shadow-sm border-blue-500/20">
                                    E-Prime One은 <span className="font-bold text-blue-500">17kg</span>으로 경쟁사 대비 <span className="font-bold text-blue-500">20% 더 가볍습니다.</span> 이를 마케팅 포인트로 활용할 수 있습니다.
                                </div>
                                <span className="text-[10px] text-zinc-500 mt-1.5 ml-1">오전 1:08</span>
                            </div>
                        </motion.div>

                        {/* Thought Process */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2.0 }}
                            className="flex justify-center"
                        >
                            <div className="px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-[10px] text-zinc-500 font-medium">
                                AI가 학생의 질문 의도를 분석 중입니다...
                            </div>
                        </motion.div>

                        {/* Message 3: Student */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 3.0 }}
                            className="flex justify-end gap-3"
                        >
                            <div className="flex flex-col items-end max-w-[85%]">
                                <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-3 rounded-2xl rounded-tr-sm text-[13px] leading-relaxed border border-zinc-200 dark:border-zinc-700">
                                    경량화가 실제 타겟 고객에게 어떤 실용적 가치를 주지?
                                </div>
                                <span className="text-[10px] text-zinc-500 mt-1.5 mr-1">오전 1:13</span>
                            </div>
                        </motion.div>

                        {/* Message 4: AI */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 4.2 }}
                            className="flex justify-start gap-3"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex flex-col items-start max-w-[85%]">
                                <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-700 px-4 py-3 rounded-2xl rounded-tl-sm text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 shadow-sm border-purple-500/20">
                                    단순한 무게 감소를 넘어, <span className="font-semibold text-purple-500">배터리 효율 증대와 휴대성 극대화</span>라는 실질적 편익을 제공합니다.
                                </div>
                                <span className="text-[10px] text-zinc-500 mt-1.5 ml-1">오전 1:13</span>
                            </div>
                        </motion.div>

                    </div>

                    {/* Input Area (Mock) */}
                    <div className="p-4 border-t bg-white/50 dark:bg-black/10 backdrop-blur-sm" style={{ borderColor: colors.cardBorder }}>
                        <div className="h-11 rounded-xl border bg-white dark:bg-zinc-950 flex items-center px-4 justify-between" style={{ borderColor: colors.cardBorder }}>
                            <span className="text-xs text-zinc-400">AI와 대화하며 사고를 확장하세요...</span>
                            <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
                                <ArrowRight className="w-3.5 h-3.5 text-white dark:text-black" />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* RIGHT PANEL: GRADING (4 cols) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="lg:col-span-4 rounded-xl overflow-hidden border flex flex-col min-h-[400px] lg:h-[520px]"
                    style={cardStyle}
                >
                    {/* Header */}
                    <div className="h-12 border-b flex items-center px-4 gap-2 bg-white/50 dark:bg-black/10" style={{ borderColor: colors.cardBorder }}>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-semibold tracking-tight">AI 역량 평가 리포트</span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col gap-5 text-xs">

                        {/* 1. Score & Opinion */}
                        <div className="flex gap-4 items-center">
                            <div className="flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
                                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                    <CountUp to={92} />
                                </div>
                                <div className="text-[9px] font-medium text-zinc-500 uppercase">점수</div>
                            </div>
                            <div className="flex-1 text-[11px] leading-relaxed text-zinc-500">
                                <span className="font-bold text-zinc-900 dark:text-zinc-200">종합 의견: </span>
                                마케팅 이론의 논리적 구심점이 명확하며, 타겟 세분화 수준이 매우 구체적입니다.
                            </div>
                        </div>

                        {/* 2. Highlight Box */}
                        <div className="rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/10 p-4">
                            <div className="flex items-center gap-1.5 mb-2 font-bold text-blue-500 uppercase tracking-widest text-[9px]">
                                AI 분석 하이라이트
                            </div>
                            <div className="text-[11px] text-zinc-600 dark:text-zinc-300 italic leading-relaxed">
                                &quot;MZ세대의 라이프스타일과 경량화의 실질적 효용을 연결한 점이 탁월합니다.&quot;
                            </div>
                        </div>

                        {/* 3. Metrics */}
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-medium text-zinc-400">
                                    <span>비판적 사고</span>
                                    <span>High</span>
                                </div>
                                <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "95%" }}
                                        className="h-full bg-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-medium text-zinc-400">
                                    <span>문제 해결력</span>
                                    <span>Upper</span>
                                </div>
                                <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: "88%" }}
                                        className="h-full bg-purple-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Background Decor Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-[500px] bg-blue-500/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
        </div >
    );
};


export default function HeroSection({
    headline,
    subheadline,

    ctaText = "무료로 시작하기",
    onCtaClick,
    mode = "light",
}: HeroSectionProps) {
    const colors = COLORS[mode];

    return (
        <div
            className="min-h-screen overflow-x-hidden transition-colors duration-300"
            style={{ backgroundColor: colors.bg, color: colors.text }}
        >
            {/* Navbar removed to use global Header */}

            <main className="container mx-auto px-4 pt-24 pb-20 md:pt-32 md:pb-32 relative">
                {/* Text Content */}
                <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10">

                    {/* Badge removed */}

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]"
                        style={{ color: colors.text }}
                    >
                        {headline}
                    </motion.h1>

                    {/* Subheadline */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
                        style={{ color: colors.textSec }}
                    >
                        {subheadline}
                    </motion.p>

                    {/* Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
                    >
                        <button
                            onClick={onCtaClick}
                            className={cn(
                                "group relative inline-flex items-center justify-center gap-2 px-8 py-4 text-sm font-semibold transition-all duration-300 rounded-full",
                                mode === 'dark'
                                    ? "bg-white/10 hover:bg-white/20 border-white/10 text-white"
                                    : "bg-black text-white hover:bg-zinc-800 border-transparent shadow-lg"
                            )}
                        >
                            {ctaText}
                            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>

                        <button
                            className="text-sm font-medium px-6 py-4 flex items-center gap-2 transition-all hover:opacity-100 opacity-70 border rounded-full"
                            style={{
                                color: colors.text,
                                borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                            }}
                        >
                            <Play className="w-4 h-4 fill-current" />
                            데모 영상 보기
                        </button>
                    </motion.div>
                </div>

                {/* Hero Visual (Simulating Quest-On) */}
                <ProductSimulation mode={mode} />
            </main>

            {/* Global Background Particles/Grid */}
            <div className="fixed inset-0 pointer-events-none -z-50 opacity-[0.03] mix-blend-multiply bg-[url('/noise.png')]" />
            {mode === 'dark' && (
                <div className="fixed inset-0 pointer-events-none -z-50 bg-gradient-to-b from-black via-transparent to-black" />
            )}
        </div>
    );
}
