"use client";

import HeroSection from "@/components/landing/HeroSection";
import { Sparkles } from "lucide-react";

export default function HeroV3() {
    return (
        <HeroSection
            variant="innovation"
            headline={
                <>
                    100년 된 객관식 시험,<br />
                    이제 <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">작별을 고할 시간</span>입니다.
                </>
            }
            subheadline="대학의 경쟁력은 평가 방식에서 시작됩니다. 정답 찾기 놀이에서 벗어나, AI와의 대화를 통해 진짜 문제를 해결하는 인재를 길러내세요. 교육 혁신, Quest-On이 시작합니다."
            ctaText="미래 교육 도입하기"
        />
    );
}
