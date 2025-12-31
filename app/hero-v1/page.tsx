"use client";

import HeroSection from "@/components/landing/HeroSection";
import { ShieldAlert } from "lucide-react";

export default function HeroV1() {
    return (
        <HeroSection
            variant="cheating"
            headline={
                <>
                    <span className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 bg-clip-text text-transparent">AI 부정행위</span>, 막을 수 없다면<br />
                    <span className="text-gray-900">평가의 일부로 만드세요.</span>
                </>
            }
            subheadline="ChatGPT를 사용해도 좋습니다. Quest-On은 생성형 AI를 ‘컨닝 도구’가 아닌 ‘사고력 파트너’로 전환시킵니다. 결과만 보는 시험이 아니라, 사고하는 과정 전체를 평가합니다."
            ctaText="무료로 체험하기"
        />
    );
}
