"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Pie,
  PieChart,
  Cell,
  Line,
  LineChart,
  Legend,
  RadialBar,
  RadialBarChart,
  LabelList,
} from "recharts";
import { TrendingUp, MessageSquare, FileText, Clock } from "lucide-react";

interface ExamAnalyticsCardProps {
  averageScore: number;
  averageQuestions: number;
  averageAnswerLength: number;
  averageExamDuration?: number;
  scoreDistribution: Array<{ range: string; count: number }>;
  questionCountDistribution: Array<{ range: string; count: number }>;
  answerLengthDistribution: Array<{ range: string; count: number }>;
  examDurationDistribution?: Array<{ range: string; count: number }>;
  stageAnalysis?: {
    averageScores: {
      chat: number;
      answer: number;
      feedback: number;
    };
    comparisonData: Array<{ stage: string; score: number }>;
    hasFeedback?: boolean;
  };
  rubricAnalysis?: {
    averageScores: Record<string, number>;
    radarData: Array<{ area: string; score: number; fullMark: number }>;
  };
  questionTypeAnalysis?: {
    distribution: {
      concept: number;
      calculation: number;
      strategy: number;
      other: number;
    };
    pieData: Array<{ name: string; value: number; fill: string }>;
  };
}

export function ExamAnalyticsCard({
  averageScore,
  averageQuestions,
  averageAnswerLength,
  averageExamDuration = 0,
  scoreDistribution,
  questionCountDistribution,
  answerLengthDistribution,
  examDurationDistribution = [],
  stageAnalysis,
  rubricAnalysis,
  questionTypeAnalysis,
}: ExamAnalyticsCardProps) {
  // QuestOn Blue: hsl(217.2193 91.2195% 59.8039%) = rgb(15, 116, 255)
  const questonBlue = "#0F74FF"; // QuestOn Blue RGB 값
  const questonBlueLight = "#3B9EFF";
  const questonBlueLighter = "#6BC5FF";

  const chartConfig = {
    count: {
      label: "학생 수",
      color: questonBlue,
    },
    score: {
      label: "점수",
      color: questonBlue,
    },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">시험 통계</CardTitle>
        <CardDescription className="text-xs">
          학생 응시 데이터 기반 분석
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 통계 요약 - 더 컴팩트하게 */}
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              <span>평균 점수</span>
            </div>
            <div className="text-xl font-semibold">{averageScore}점</div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <MessageSquare className="h-3 w-3" />
              <span>평균 질문</span>
            </div>
            <div className="text-xl font-semibold">{averageQuestions}개</div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <FileText className="h-3 w-3" />
              <span>평균 길이</span>
            </div>
            <div className="text-xl font-semibold">{averageAnswerLength}자</div>
          </div>

          {averageExamDuration > 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Clock className="h-3 w-3" />
                <span>평균 시간</span>
              </div>
              <div className="text-xl font-semibold">
                {averageExamDuration}분
              </div>
            </div>
          )}
        </div>

        {/* 새로운 분석 차트들 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 1. 단계별 성과 비교 (Bar 차트 - 범주형 비교에 적합) */}
          {stageAnalysis && stageAnalysis.comparisonData.length > 0 && (
            <Card className="flex flex-col">
              <CardHeader className="items-center pb-0">
                <CardTitle className="text-sm">단계별 성과 비교</CardTitle>
                <CardDescription className="text-xs">
                  Clarification → 답안 작성 → Reflection
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[200px]"
                >
                  <BarChart
                    data={stageAnalysis.comparisonData}
                    margin={{
                      top: 12,
                      right: 12,
                      left: 0,
                      bottom: 12,
                    }}
                  >
                    <XAxis
                      dataKey="stage"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={false}
                      domain={[0, 100]}
                      width={0}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => `${value}점`}
                        />
                      }
                    />
                    <Bar dataKey="score" fill={questonBlue} radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
              <CardFooter className="flex-col gap-1 text-xs pt-2">
                <div className="text-muted-foreground text-center leading-none">
                  C: {stageAnalysis.averageScores.chat}점 | 답안:{" "}
                  {stageAnalysis.averageScores.answer}점
                  {stageAnalysis.hasFeedback !== false && (
                    <> | R: {stageAnalysis.averageScores.feedback}점</>
                  )}
                </div>
              </CardFooter>
            </Card>
          )}

          {/* 2. 질문 유형별 분포 (Pie 차트) */}
          {questionTypeAnalysis && questionTypeAnalysis.pieData.length > 0 && (
            <Card className="flex flex-col">
              <CardHeader className="items-center pb-0">
                <CardTitle className="text-sm">질문 유형별 분포</CardTitle>
                <CardDescription className="text-xs">
                  Clarification 질문 유형
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[200px]"
                >
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, name) => [`${value}개`, name]}
                        />
                      }
                    />
                    <Pie
                      data={questionTypeAnalysis.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                    >
                      {questionTypeAnalysis.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
              <CardFooter className="flex-col gap-1 text-xs pt-2">
                <div className="text-muted-foreground text-center leading-none space-x-2">
                  {questionTypeAnalysis.pieData.map((entry, index) => (
                    <span key={index}>
                      {entry.name}:{" "}
                      {(
                        (entry.value /
                          questionTypeAnalysis.pieData.reduce(
                            (sum, e) => sum + e.value,
                            0
                          )) *
                        100
                      ).toFixed(0)}
                      %
                    </span>
                  ))}
                </div>
              </CardFooter>
            </Card>
          )}

          {/* 3. 루브릭 항목별 역량 (Radar 차트) */}
          {rubricAnalysis && rubricAnalysis.radarData.length > 0 && (
            <Card className="flex flex-col">
              <CardHeader className="items-center pb-0">
                <CardTitle className="text-sm">루브릭 항목별 역량</CardTitle>
                <CardDescription className="text-xs">
                  평균 점수 (0-5점 척도)
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[200px]"
                >
                  <RadarChart data={rubricAnalysis.radarData}>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, props) => [
                            `${value}/5점`,
                            props.payload.area,
                          ]}
                        />
                      }
                    />
                    <PolarAngleAxis
                      dataKey="area"
                      tick={{
                        fontSize: 8,
                        fill: "#666",
                      }}
                      tickFormatter={(value) => {
                        // 긴 텍스트를 간소화
                        if (value.length > 8) {
                          return value.substring(0, 6) + "...";
                        }
                        return value;
                      }}
                    />
                    <PolarGrid />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 5]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      dataKey="score"
                      stroke={questonBlue}
                      fill={questonBlue}
                      fillOpacity={0.6}
                      dot={{
                        r: 3,
                        fillOpacity: 1,
                      }}
                    />
                  </RadarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* 4. 시험 소요 시간 분포 (Bar 차트 - 범주형 분포에 적합) */}
          {examDurationDistribution.length > 0 && (
            <Card className="flex flex-col">
              <CardHeader className="items-center pb-0">
                <CardTitle className="text-sm">시험 소요 시간 분포</CardTitle>
                <CardDescription className="text-xs">
                  학생별 시험 시간 분포
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-0">
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[200px]"
                >
                  <BarChart
                    data={examDurationDistribution}
                    margin={{
                      top: 12,
                      right: 12,
                      left: 0,
                      bottom: 40,
                    }}
                  >
                    <XAxis
                      dataKey="range"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 9 }}
                      angle={-25}
                      textAnchor="end"
                      height={40}
                      interval={0}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={false}
                      allowDecimals={false}
                      width={0}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => `${value}명`}
                        />
                      }
                    />
                    <Bar dataKey="count" fill={questonBlue} radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 평균 수치 Radial Chart - 하나로 통합 */}
        <Card className="flex flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle className="text-sm">평균 수치</CardTitle>
            <CardDescription className="text-xs">
              시험 응시 데이터 요약
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer
              config={chartConfig}
              className="mx-auto aspect-square max-h-[300px]"
            >
              <RadialBarChart
                data={[
                  {
                    name: "평균 점수",
                    value: Math.min(100, Math.max(0, averageScore)),
                    fill: questonBlue,
                    label: `${averageScore}점`,
                  },
                  {
                    name: "평균 질문",
                    value: Math.min(
                      100,
                      Math.max(0, (averageQuestions / 20) * 100)
                    ),
                    fill: questonBlueLight,
                    label: `${averageQuestions}개`,
                  },
                  {
                    name: "평균 길이",
                    value: Math.min(
                      100,
                      Math.max(0, (averageAnswerLength / 2000) * 100)
                    ),
                    fill: questonBlueLighter,
                    label: `${averageAnswerLength}자`,
                  },
                  ...(averageExamDuration > 0
                    ? [
                        {
                          name: "평균 시간",
                          value: Math.min(
                            100,
                            Math.max(0, (averageExamDuration / 120) * 100)
                          ),
                          fill: "#9DD5FF",
                          label: `${averageExamDuration}분`,
                        },
                      ]
                    : []),
                ]}
                startAngle={-90}
                endAngle={380}
                innerRadius={20}
                outerRadius={120}
              >
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel nameKey="name" />}
                />
                <RadialBar dataKey="value" background>
                  <LabelList
                    position="insideStart"
                    dataKey="name"
                    className="fill-white font-medium"
                    fontSize={11}
                  />
                </RadialBar>
              </RadialBarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col gap-2 text-xs">
            <div className="grid grid-cols-4 gap-2 w-full">
              <div className="flex flex-col items-center">
                <div className="text-muted-foreground">점수</div>
                <div className="font-semibold">{averageScore}점</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-muted-foreground">질문</div>
                <div className="font-semibold">{averageQuestions}개</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="text-muted-foreground">길이</div>
                <div className="font-semibold">{averageAnswerLength}자</div>
              </div>
              {averageExamDuration > 0 && (
                <div className="flex flex-col items-center">
                  <div className="text-muted-foreground">시간</div>
                  <div className="font-semibold">{averageExamDuration}분</div>
                </div>
              )}
            </div>
          </CardFooter>
        </Card>
      </CardContent>
    </Card>
  );
}
