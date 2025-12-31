"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import {
    ShieldCheck,
    Brain,
    MessageSquare,
    ArrowRight,
    Lock,
    Zap,
    Users,
    Globe,
    CheckCircle2,
    Sparkles,
    BarChart3,
    ShieldAlert,
    Lightbulb,
    Clock,
    AlertTriangle,
    FileText,
    Quote
} from "lucide-react";

interface FeatureCardProps {
    title: string;
    description: string;
    linkText?: string;
    linkHref?: string;
    reversed?: boolean;
    children: ReactNode;
    mode?: "light" | "dark";
}

function WindowChrome({ children, title, subtitle, mode }: { children: ReactNode; title: string; subtitle?: string; mode: "light" | "dark" }) {
    const isDark = mode === "dark";
    return (
        <div className={`flex flex-col h-full w-full rounded-2xl overflow-hidden shadow-2xl border ${isDark ? "bg-[#121212] border-zinc-800" : "bg-white border-zinc-100"
            }`}>
            <div className={`flex h-12 items-center justify-between border-b px-5 ${isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-50 border-zinc-100"
                }`}>
                <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className={`h-3 w-3 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
                        <div className={`h-3 w-3 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
                        <div className={`h-3 w-3 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                        <span className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{title}</span>
                        {subtitle && <span className="text-[10px] text-zinc-500 opacity-50">• {subtitle}</span>}
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
                {children}
            </div>
        </div>
    );
}

function FeatureCard({
    title,
    description,
    linkText,
    linkHref = "#",
    reversed = false,
    children,
    mode = "light",
}: FeatureCardProps) {
    const isDark = mode === "dark";

    return (
        <div className="container mx-auto mb-20 px-6">
            <div
                className={`relative block overflow-hidden rounded-[2.5rem] p-8 lg:p-16 transition-all border ${isDark
                    ? "bg-zinc-900/40 border-zinc-900"
                    : "bg-zinc-50/50 border-zinc-100"
                    }`}
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    <div className={`${reversed ? "lg:order-2" : "lg:order-1"}`}>
                        <h3 className={`text-3xl lg:text-4xl font-bold tracking-tight mb-6 ${isDark ? "text-white" : "text-[#1F1F1F]"}`}>{title}</h3>
                        <p className={`text-lg lg:text-xl leading-relaxed mb-8 font-medium ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{description}</p>
                        {linkText && (
                            <a href={linkHref} className={`inline-flex items-center gap-2 font-bold transition-all hover:gap-3 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                                {linkText} <ArrowRight className="w-5 h-5" />
                            </a>
                        )}
                    </div>
                    <div className={`${reversed ? "lg:order-1" : "lg:order-2"}`}>
                        <div className="relative h-[480px] group">
                            <div className="absolute -inset-4 bg-blue-500/10 rounded-[3rem] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <div className="relative h-full transform group-hover:scale-[1.02] transition-transform duration-700">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SecondaryFeature({ title, description, icon: Icon, mode }: { title: string, description: string, icon: any, mode: "light" | "dark" }) {
    const isDark = mode === "dark";
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`p-8 rounded-[2rem] border transition-all hover:shadow-xl hover:-translate-y-1 ${isDark ? "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300 shadow-sm"
                }`}
        >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${isDark ? "bg-zinc-800 text-blue-400" : "bg-zinc-100 text-blue-600"
                }`}>
                <Icon className="w-6 h-6" />
            </div>
            <h4 className={`text-xl font-bold mb-4 ${isDark ? "text-white" : "text-[#1F1F1F]"}`}>{title}</h4>
            <p className={`text-sm leading-relaxed font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{description}</p>
        </motion.div>
    );
}

const PRIMARY_FEATURES = [
    {
        id: "tracking",
        title: "시험 응시 데이터 트래킹",
        description: "학생이 문제를 풀며 AI와 나눈 대화, 답안 수정 이력, 소요 시간 등 모든 사고의 과정을 데이터로 기록합니다.",
        icon: BarChart3
    },
    {
        id: "grading",
        title: "단계별 채점 리포트",
        description: "단순히 결과만 채점하지 않습니다. 채팅 대화의 질, 논리적 흐름, 최종 답안의 타당성을 다단계로 분석하여 정교한 점수를 산출해 드립니다.",
        icon: ShieldCheck
    }
];

export default function FeatureSection({ mode = "light" }: { mode?: "light" | "dark" }) {
    const isDark = mode === "dark";

    return (
        <section className={`py-24 space-y-12 ${isDark ? "bg-black" : "bg-white"}`}>

            {/* Feature 1: Tracking */}
            <FeatureCard
                title={PRIMARY_FEATURES[0].title}
                description={PRIMARY_FEATURES[0].description}
                linkText="제품 상세 로드맵"
                mode={mode}
            >
                <WindowChrome title="학생 채점 리포트 (Student Report)" mode={mode}>
                    <div className="p-6 space-y-5 h-full overflow-y-auto bg-white dark:bg-zinc-950">
                        {/* Summary implementation same as before but hardcoded */}
                        <div className="flex justify-between items-start border-b pb-4 border-zinc-100 dark:border-zinc-800">
                            <div className="space-y-1">
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">문정호 학생 채점</div>
                                <div className="text-[10px] text-zinc-500 font-medium">제출일: 2025. 12. 28.</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-black text-blue-600 italic">86점</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <div className="text-[9px] text-zinc-400 font-bold flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> 소요 시간</div>
                                <div className="text-lg font-black text-zinc-900 dark:text-zinc-100">91분</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] text-zinc-400 font-bold flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5" /> 질문 수</div>
                                <div className="text-lg font-black text-zinc-900 dark:text-zinc-100">25개</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[9px] text-zinc-400 font-bold flex items-center gap-1"><FileText className="w-2.5 h-2.5" /> 답안 길이</div>
                                <div className="text-lg font-black text-zinc-900 dark:text-zinc-100">2,988자</div>
                            </div>
                        </div>
                        <div className="space-y-4 pt-4 border-t border-zinc-50 dark:border-zinc-900">
                            {/* Suspicious Bar (Red) */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600">
                                    <AlertTriangle className="w-3 h-3" /> 부정행위 의심 활동 감지
                                </div>
                                <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                                    <ul className="space-y-1.5">
                                        {[
                                            "84자 외부 붙여넣기 (오전 12:18:12)",
                                            "380자 외부 붙여넣기 (오전 12:35:10)",
                                            "112자 외부 붙여넣기 (오전 12:38:22)",
                                            "102자 외부 붙여넣기 (오전 12:40:52)"
                                        ].map((text, i) => (
                                            <li key={i} className="text-[9px] text-red-600/80 font-mono flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-red-400" /> {text}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Internal Copy (Blue) */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
                                    <FileText className="w-3 h-3" /> 내부 복사 활동
                                </div>
                                <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20">
                                    <ul className="grid grid-cols-1 gap-1">
                                        {[
                                            "149자 내부 복사 (오전 12:22:23)",
                                            "116자 내부 복사 (오전 12:23:08)",
                                            "80자 내부 복사 (오전 12:23:39)",
                                            "71자 내부 복사 (오전 12:27:40)"
                                        ].map((text, i) => (
                                            <li key={i} className="text-[9px] text-blue-600/80 font-mono flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-blue-400" /> {text}
                                            </li>
                                        ))}
                                        <li className="text-[8px] text-blue-400 font-bold italic ml-2.5">+ 그 외 6건의 활동 더보기</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </WindowChrome>
            </FeatureCard>

            {/* Feature 2: Grading */}
            <FeatureCard
                title={PRIMARY_FEATURES[1].title}
                description={PRIMARY_FEATURES[1].description}
                linkText="제품 상세 로드맵"
                reversed
                mode={mode}
            >
                <WindowChrome title="AI 종합 평가 리포트 (AI Assessment)" mode={mode}>
                    <div className="p-6 h-full overflow-y-auto bg-white dark:bg-zinc-950 flex flex-col gap-6">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                            <Sparkles className="w-4 h-4" /> AI 종합 평가
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                            {/* Left Column: Opinion & Highlights */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="text-[10px] font-bold text-zinc-400">종합 의견</div>
                                    <p className="text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-400 font-medium text-justify">
                                        이 학생의 답안은 전반적으로 논리적이며 마케팅 이론의 구조를 충실히 따르고 있다. 3C와 SWOT 분석이 구체적으로 연결되어 있고, STP와 4P 전략 설계가 일관된 논리를 바탕으로 전개되었다. 특히 경쟁사 대비 자사 기술 우위를 정량적 수치로 제시(예: 주행거리·무게 감소율)함으로써 답안의 설득력을 높였다. 또한 가격과 프로모션 전략을 설정할 때 단순 나열이 아닌, 실제 시장 제약(거짓·과장 광고 문제, 보조금 정책 등)을 고려한 합리적 사고가 드러난다.
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-yellow-50/80 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/20 space-y-3">
                                    <div className="flex items-center gap-2 text-[9px] font-bold text-yellow-700 dark:text-yellow-600 uppercase tracking-wider">
                                        <Quote className="w-3 h-3 fill-current" /> 핵심 인용구 (Highlight)
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-[10px] italic font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed">
                                            "기술 중심 브랜드를 선호하면서도 친환경 소비에 민감한, 즉 고성능과 친환경 두 요소를 모두 어필할 수 있는 MZ세대를 타겟으로 설정해야겠다고 판단함."
                                        </p>
                                        <p className="text-[10px] italic font-bold text-zinc-800 dark:text-zinc-200 leading-relaxed">
                                            "제품 체험 이벤트를 통해 제품을 체험하는 고객은 온라인 SNS 채널을 통해 후기를 공유하는 것을 의무로 설정하고..."
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Strengths & Improvements */}
                            <div className="grid grid-cols-1 gap-4">
                                {/* Strengths */}
                                <div className="bg-blue-50/50 dark:bg-blue-900/5 border border-blue-100 dark:border-blue-900/10 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-bold text-blue-600 flex items-center gap-1.5">
                                        <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] text-blue-600">+</span> 강점
                                    </div>
                                    <ul className="space-y-2">
                                        {[
                                            "3C 및 SWOT 분석 간의 논리적 일관성이 높고, 경쟁사 약점과 자사 강점을 정량적 근거로 비교하여 차별점 명확히 제시함.",
                                            "STP에서 타겟 세그먼트 선정(25~39세 MZ세대 도심 통근자)이 자사 강점 및 시장 트렌드와 일치하며, 기술·친환경 가치를 중심으로 포지셔닝을 설계함.",
                                            "Price와 Promotion 전략에서 현실 제약(보조금·광고 규제)을 고려하고, 사용자 참여형 앱을 통한 친환경 체험 마케팅 등 창의적 실천 방안을 제시함."
                                        ].map((item, i) => (
                                            <li key={i} className="text-[9px] text-zinc-600 dark:text-zinc-400 flex gap-2 leading-relaxed">
                                                <span className="text-blue-400 mt-0.5">•</span>
                                                <span className="flex-1">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Improvements */}
                                <div className="bg-orange-50/50 dark:bg-orange-900/5 border border-orange-100 dark:border-orange-900/10 rounded-xl p-4 space-y-3">
                                    <div className="text-[10px] font-bold text-orange-600 flex items-center gap-1.5">
                                        <span className="w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-[10px] text-orange-600">-</span> 개선점
                                    </div>
                                    <ul className="space-y-2">
                                        {[
                                            "STP에서 타겟 세분화의 근거가 인구통계적 수준에 머물러 있으며, 심리·행동적 세그먼트(예: 혁신 수용자)에 대한 분석이 부족함.",
                                            "유통전략(Place)이 단순히 '온라인 및 직영몰'에 그쳐 옴니채널 전략이나 파트너십 방안이 제시되지 않아 현실적 확장성이 떨어짐.",
                                            "프로모션 전략의 실행 메커니즘이 다소 모호함. SNS 후기 공유를 '의무화'하는 방식은 자발적 브랜드 충성도 형성에 부정적 영향을 줄 가능성이 있음."
                                        ].map((item, i) => (
                                            <li key={i} className="text-[9px] text-zinc-600 dark:text-zinc-400 flex gap-2 leading-relaxed">
                                                <span className="text-orange-400 mt-0.5">•</span>
                                                <span className="flex-1">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </WindowChrome>
            </FeatureCard>

            {/* Grid for core value assurance */}
            <div className="container mx-auto px-6 pt-16">
                <div className="mb-16">
                    <h2 className={`text-2xl md:text-3xl font-bold mb-4 tracking-tight ${isDark ? "text-white" : "text-[#1F1F1F]"}`}>핵심 가치 보장</h2>
                    <p className={`text-base font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>Quest-On이 교육의 질을 높이기 위해 약속하는 기술적 표준입니다.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <SecondaryFeature
                        mode={mode}
                        icon={Lock}
                        title="데이터 보안 및 프라이버시"
                        description="모든 응시 데이터와 평가 리포트는 엔터프라이즈 급 암호화 기술로 보호되며, 기관의 승인 없이 외부로 유출되지 않습니다."
                    />
                    <SecondaryFeature
                        mode={mode}
                        icon={Zap}
                        title="AI 가채점 및 가이드"
                        description="응시 직후 생성되는 AI 가채점 점수와 요약 리포트를 통해 채점 소요 시간을 80% 이상 획기적으로 단축합니다."
                    />
                    <SecondaryFeature
                        mode={mode}
                        icon={Users}
                        title="대규모 동시 응시 지원"
                        description="수천 명의 학생이 동시 응시하는 환경에서도 중단 없는 안정적인 서버 아키텍처를 통해 원활한 시험 진행을 보장합니다."
                    />
                    <SecondaryFeature
                        mode={mode}
                        icon={Globe}
                        title="국제 교육 표준 규격 준수"
                        description="다양한 언어와 글로벌 표준 교육 커리큘럼에 유연하게 대응하며, 범용적인 인터페이스 규격을 제공합니다."
                    />
                    <SecondaryFeature
                        mode={mode}
                        icon={Lightbulb}
                        title="자동 시사/배경 지식 생성"
                        description="시험 생성 시 AI가 최신 시사 이슈와 관련 배경 지식을 자동으로 제안하여 문항의 퀄리티를 높여줍니다."
                    />
                    <SecondaryFeature
                        mode={mode}
                        icon={BarChart3}
                        title="종합 역량 성장 추이"
                        description="누적된 평가 데이터를 기반으로 학생 및 클래스별 역량 변화를 시각화하여 장기적인 교육 계획 수립을 돕습니다."
                    />
                </div>
            </div>
        </section>
    );
}

