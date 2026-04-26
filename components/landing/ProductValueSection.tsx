"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  FileCheck2,
  MessageSquareText,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const answerText =
  "친환경 전기자전거는 경량화된 프레임과 긴 배터리 수명을 중심으로 포지셔닝해야 합니다. 특히 도심 통근자와 친환경 소비 성향이 높은 MZ세대를 핵심 타겟으로 설정하고...";

const chatMessages = [
  { side: "student", text: "경쟁사 대비 차별점을 어떻게 잡을까요?" },
  {
    side: "ai",
    text: "제품의 경량화, 배터리 효율, 타겟 세그먼트를 연결해 보세요.",
  },
  { side: "student", text: "타겟 고객은 어떻게 잡을까요?" },
] as const;

const chartBars = [56, 78, 44, 92, 68, 84, 72];
const rubricPoints = [
  "50%_18%",
  "82%_28%",
  "88%_58%",
  "58%_84%",
  "24%_62%",
];

const gradingRows = [
  { name: "김민준", score: 92, status: "완료" },
  { name: "이지윤", score: 88, status: "완료" },
  { name: "박서연", score: 76, status: "완료" },
  { name: "최현우", score: 81, status: "완료" },
  { name: "정하윤", score: 95, status: "완료" },
  { name: "오지훈", score: 73, status: "완료" },
  { name: "한서아", score: 89, status: "완료" },
  { name: "문도윤", score: 84, status: "완료" },
];

const evaluationText =
  "이 학생의 답안은 전반적으로 논리적이며 마케팅 이론의 구조를 충실히 따르고 있습니다. 3C와 SWOT 분석이 구체적으로 연결되어 높은 설득력을 가집니다. AI와의 대화에서도 단순 답변 복사가 아니라 근거를 재구성하는 과정이 확인됩니다.";

export default function ProductValueSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const hasStartedRef = useRef(false);
  const [answerLength, setAnswerLength] = useState(0);
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [chartReady, setChartReady] = useState(false);
  const [highlightOn, setHighlightOn] = useState(false);
  const [score, setScore] = useState(0);
  const [typedEvaluationLength, setTypedEvaluationLength] = useState(0);
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const intervals: Array<ReturnType<typeof setInterval>> = [];

    const startAnimations = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      const answerInterval = setInterval(() => {
        setAnswerLength((current) => {
          const next = Math.min(current + 2, answerText.length);
          if (next === answerText.length) clearInterval(answerInterval);
          return next;
        });
      }, 55);
      intervals.push(answerInterval);

      chatMessages.forEach((_, index) => {
        timers.push(
          setTimeout(() => {
            setVisibleMessages(index + 1);
          }, 700 + index * 950)
        );
      });

      timers.push(setTimeout(() => setChartReady(true), 1400));
      timers.push(setTimeout(() => setHighlightOn(true), 1600));

      timers.push(
        setTimeout(() => {
          const scoreInterval = setInterval(() => {
            setScore((current) => {
              const next = Math.min(current + 4, 92);
              if (next === 92) clearInterval(scoreInterval);
              return next;
            });
          }, 45);
          intervals.push(scoreInterval);
        }, 500)
      );

      const evaluationInterval = setInterval(() => {
        setTypedEvaluationLength((current) => {
          const next = Math.min(current + 1, evaluationText.length);
          if (next === evaluationText.length) clearInterval(evaluationInterval);
          return next;
        });
      }, 70);
      intervals.push(evaluationInterval);

      gradingRows.forEach((_, index) => {
        timers.push(
          setTimeout(() => {
            setVisibleRows(index + 1);
          }, 700 + index * 360)
        );
      });
    };

    const currentSection = sectionRef.current;
    let observer: IntersectionObserver | null = null;
    if (!currentSection || typeof IntersectionObserver === "undefined") {
      startAnimations();
    } else {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            startAnimations();
            observer?.disconnect();
          }
        },
        { rootMargin: "0px 0px -20% 0px", threshold: 0.2 }
      );
      observer.observe(currentSection);
      timers.push(setTimeout(() => observer?.disconnect(), 30000));
    }

    return () => {
      observer?.disconnect();
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="product-values"
      className="bg-gradient-to-b from-white via-slate-50/70 to-white py-20 lg:py-28"
    >
      <div className="container mx-auto px-4 lg:px-6">
        <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center gap-4 text-center lg:mb-16">
          <Badge
            variant="outline"
            className="rounded-full border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700"
          >
            Quest-On이 바꾸는 평가 경험
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl lg:text-5xl">
            시험 응시부터 AI 가채점까지,
            <br />
            한 흐름으로 연결됩니다.
          </h2>
          <p className="max-w-2xl text-base leading-[1.7] text-slate-600 md:text-lg">
            실제 Quest-On에서 일어나는 작성, 대화, 분석, 채점 흐름을 움직이는
            UI로 보여줍니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white py-0 shadow-xl shadow-blue-100/70 lg:col-span-7">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-blue-600" />
                  <p className="font-bold text-slate-950">학생 시험 응시 화면</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  응시 중
                </div>
              </div>
              <div className="grid min-h-[440px] gap-4 p-5 md:grid-cols-[1fr_320px]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        Question 03
                      </p>
                      <h3 className="mt-2 text-xl font-bold text-slate-950">
                        친환경 전기자전거의 시장 진입 전략을 작성하세요.
                      </h3>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-blue-600 shadow-sm">
                      42:18
                    </div>
                  </div>
                  <div className="min-h-[184px] rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-800">답안 작성</p>
                      <span className="text-xs font-semibold text-slate-500">
                        autosaved
                      </span>
                    </div>
                    <p className="text-sm leading-[1.7] text-slate-700">
                      {answerText.slice(0, answerLength)}
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-600 align-middle" />
                    </p>
                  </div>
                </div>
                <div className="flex flex-col rounded-3xl border border-blue-100 bg-white shadow-lg shadow-blue-100/60">
                  <div className="flex items-center justify-between border-b border-blue-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-bold text-slate-950">AI 튜터</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                      live
                    </span>
                  </div>
                  <div className="flex-1 space-y-3 bg-slate-50 p-4 text-xs">
                    {chatMessages.slice(0, visibleMessages).map((message) => (
                      <div
                        key={message.text}
                        className={`max-w-[90%] animate-fade-in-up-xs rounded-2xl px-4 py-3 shadow-sm ${
                          message.side === "student"
                            ? "ml-auto rounded-tr-sm bg-blue-600 text-white"
                            : "rounded-tl-sm border bg-white text-slate-700"
                        }`}
                      >
                        {message.text}
                      </div>
                    ))}
                    <div className="flex items-center gap-1 rounded-full border bg-white px-4 py-3 shadow-sm">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white py-0 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl lg:col-span-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  <p className="font-bold text-slate-950">시험 데이터 시각화</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">
                  {chartReady ? "그래프 생성 완료" : "데이터 분석 중"}
                </span>
              </div>
              <div className="p-5">
                <div className="mb-4 grid grid-cols-4 gap-2">
                  {[
                    ["평균 점수", "84점"],
                    ["평균 질문", "6개"],
                    ["평균 길이", "1.2k"],
                    ["평균 시간", "42분"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold text-slate-500">{label}</p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border bg-slate-50 p-4">
                    <div className="mb-3 text-center text-xs font-bold text-slate-800">
                      단계별 성과 비교
                    </div>
                    <div className="flex h-28 items-end gap-3">
                      {[
                        ["C", 72],
                        ["답안", 88],
                        ["R", 81],
                      ].map(([label, height], index) => (
                        <div
                          key={label}
                          className="flex flex-1 flex-col items-center gap-2"
                        >
                          <div className="flex h-20 w-full items-end overflow-hidden rounded-lg bg-white">
                            <div
                              className="w-full rounded-lg bg-[#0F74FF] transition-all duration-1000 ease-out"
                              style={{
                                height: chartReady ? `${height}%` : "8%",
                                transitionDelay: `${index * 140}ms`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-slate-50 p-4">
                    <div className="mb-3 text-center text-xs font-bold text-slate-800">
                      질문 유형별 분포
                    </div>
                    <div
                      className="mx-auto flex h-28 w-28 items-center justify-center rounded-full transition-all duration-1000"
                      style={{
                        background: chartReady
                          ? "conic-gradient(#0F74FF 0 42%, #3B9EFF 42% 68%, #6BC5FF 68% 86%, #DBEAFE 86% 100%)"
                          : "conic-gradient(#E2E8F0 0 100%)",
                      }}
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-xs font-black text-slate-800">
                        AI 질문
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-slate-50 p-4">
                    <div className="mb-3 text-center text-xs font-bold text-slate-800">
                      루브릭 항목별 역량
                    </div>
                    <div className="relative mx-auto h-28 w-28">
                      <div className="absolute inset-3 rounded-full border border-slate-200" />
                      <div className="absolute inset-8 rounded-full border border-slate-200" />
                      {rubricPoints.map((point, index) => {
                        const [left, top] = point.split("_");
                        return (
                          <span
                            key={point}
                            className="absolute h-2.5 w-2.5 rounded-full bg-[#0F74FF] transition-all duration-700"
                            style={{
                              left: chartReady ? left : "50%",
                              top: chartReady ? top : "50%",
                              transitionDelay: `${index * 120}ms`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-slate-50 p-4">
                    <div className="mb-3 text-center text-xs font-bold text-slate-800">
                      평균 수치
                    </div>
                    <div
                      className="mx-auto flex h-28 w-28 items-center justify-center rounded-full transition-all duration-1000"
                      style={{
                        background: chartReady
                          ? "conic-gradient(#0F74FF 0 84%, #E2E8F0 84% 100%)"
                          : "conic-gradient(#E2E8F0 0 100%)",
                      }}
                    >
                      <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
                        <span className="text-2xl font-black text-slate-950">
                          {chartReady ? "84" : "..."}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          평균 점수
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>응시 로그 수집</span>
                  <span>{chartReady ? "분포 계산 완료" : "분포 계산 중..."}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white py-0 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl lg:col-span-4">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-5 w-5 text-rose-600" />
                  <p className="font-bold text-slate-950">최종답안 · 복붙 감지</p>
                </div>
                <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
                  4건
                </span>
              </div>
              <div className="space-y-4 p-5">
                  <div className="rounded-2xl border bg-slate-50 p-4">
                  <p className="mb-3 text-sm font-bold text-slate-800">
                    최종 답안 일부
                  </p>
                  <p className="text-xs leading-[1.8] text-slate-700">
                    친환경 소비에 민감한 MZ세대를 타겟으로 설정하고{" "}
                    <span
                      className={`rounded px-1 transition-all duration-700 ${
                        highlightOn
                          ? "bg-rose-200 text-rose-950 ring-4 ring-rose-100"
                          : "bg-transparent"
                      }`}
                    >
                      프리미엄 전기자전거라면 불가피하게 가격을 고가로 설정해야
                      하고
                    </span>{" "}
                    이에 따라 그 가격을 받아들일 고객군을 구체화해야 합니다.
                  </p>
                </div>
                {[
                  ["외부 붙여넣기", "12:18:12", "84자"],
                  ["외부 붙여넣기", "12:35:10", "380자"],
                  ["내부 복사", "12:23:08", "149자"],
                ].map(([label, time, value], index) => (
                  <div
                    key={`${label}-${time}`}
                    className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border p-4 transition-all duration-500 ${
                      highlightOn && index === 0
                        ? "border-rose-200 bg-rose-50"
                        : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-950">{label}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {time}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white py-0 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl lg:col-span-4">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-violet-600" />
                  <p className="font-bold text-slate-950">종합 평가</p>
                </div>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">
                  {score}점
                </span>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-[76px_1fr] gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-950 text-3xl font-black text-white">
                    {score}
                  </div>
                  <p className="text-sm leading-[1.7] text-slate-700">
                    {evaluationText.slice(0, typedEvaluationLength)}
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-violet-600 align-middle" />
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-xs font-bold text-blue-700">강점</p>
                    <p className="mt-2 text-xs leading-relaxed text-blue-950">
                      3C와 SWOT 분석 간 논리적 일관성이 우수합니다.
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-1000"
                        style={{ width: `${Math.min(score, 80)}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs font-bold text-amber-700">개선점</p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-950">
                      유통전략과 프로모션 실행 메커니즘은 더 구체화가 필요합니다.
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-1000"
                        style={{ width: `${Math.min(score, 64)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white py-0 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl lg:col-span-4">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-600" />
                  <p className="font-bold text-slate-950">AI 자동 가채점</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  128명
                </span>
              </div>
              <div className="max-h-[420px] space-y-3 overflow-hidden p-5">
                {gradingRows.slice(0, visibleRows).map((row, index) => (
                  <div
                    key={row.name}
                    className="grid animate-fade-in-up-xs grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-black text-slate-700 shadow-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-950">
                          {row.name}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {row.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-900 shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {row.score}
                    </div>
                  </div>
                ))}
                {visibleRows < gradingRows.length && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <div>
                        <p className="text-sm font-bold text-blue-900">
                          {gradingRows[visibleRows]?.name} 답안 가채점 중
                        </p>
                        <p className="mt-1 text-xs font-medium text-blue-700">
                          완료되면 위 완료 리스트로 올라갑니다
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-white px-3 py-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
                      </div>
                    </div>
                    {gradingRows.slice(visibleRows + 1, visibleRows + 3).map((row) => (
                      <div
                        key={row.name}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4 opacity-70"
                      >
                        <span className="text-sm font-bold text-slate-700">
                          {row.name}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          대기
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
