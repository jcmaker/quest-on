"use client";

import HeroSection from "@/components/landing/HeroSection";
import { Zap } from "lucide-react";

export default function HeroV2() {
    return (
        <HeroSection
            headline={
                <>
                    서술형 채점 100명분,<br />
                    <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">커피 한 잔 마실 시간</span>이면 끝납니다.
                </>
            }
            subheadline="밤새워 채점하던 시대는 끝났습니다. AI가 실시간으로 답안을 분석하고, 정량/정성 평가 리포트까지 완벽하게 제공합니다. 교수님은 교육의 본질에만 집중하세요."
            ctaText="채점 자동화 체험하기"
        />
    );
}
