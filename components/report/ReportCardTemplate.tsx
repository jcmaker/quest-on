import React, { forwardRef } from "react";

interface Question {
  id: string;
  idx: number;
  type: string;
  prompt: string;
}

interface Grade {
  id: string;
  q_idx: number;
  score: number;
  comment?: string;
}

interface AISummary {
  sentiment?: "positive" | "negative" | "neutral";
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  keyQuotes?: string[];
}

export interface ReportCardProps {
  examTitle: string;
  examCode: string;
  examDescription?: string | null;
  studentName: string;
  submittedAt: string;
  overallScore: number | null;
  questions: Question[];
  grades: Record<number, Grade>;
  aiSummary?: AISummary | null;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function getGrade(score: number): string {
  if (score >= 90) return "A (최우수)";
  if (score >= 80) return "B (우수)";
  if (score >= 70) return "C (보통)";
  if (score >= 60) return "D (노력 필요)";
  return "F (재평가 필요)";
}

export const ReportCardTemplate = forwardRef<HTMLDivElement, ReportCardProps>(
  (
    {
      examTitle,
      examCode,
      examDescription,
      studentName,
      submittedAt,
      overallScore,
      questions,
      grades,
      aiSummary,
    },
    ref
  ) => {
    const formattedDate = new Date(submittedAt).toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        ref={ref}
        data-pdf-template="true"
        style={{
          width: "210mm",
          minHeight: "297mm",
          backgroundColor: "#ffffff",
          color: "#1e293b",
          padding: "40px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: "0 auto",
          boxSizing: "border-box",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "32px",
            borderBottom: "2px solid #2563eb",
            paddingBottom: "24px",
          }}
        >
          <img
            src="/qlogo_icon.png"
            alt="Logo"
            style={{
              width: "50px",
              height: "50px",
              marginRight: "24px",
              borderRadius: "4px",
            }}
          />
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#0f172a",
                marginBottom: "4px",
                margin: "0 0 4px 0",
              }}
            >
              평가 결과 리포트
            </h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
              {examTitle}
            </p>
          </div>
        </div>

        {/* Info Grid */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          {/* Student Info */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#f8fafc",
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "16px",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "8px",
                margin: "0 0 16px 0",
              }}
            >
              학생 정보
            </h3>
            <div style={{ display: "flex", marginBottom: "8px" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                이름
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {studentName}
              </span>
            </div>
            <div style={{ display: "flex" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                제출일
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Exam Info */}
          <div
            style={{
              flex: 1,
              backgroundColor: "#f8fafc",
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "16px",
                borderBottom: "1px solid #cbd5e1",
                paddingBottom: "8px",
                margin: "0 0 16px 0",
              }}
            >
              시험 정보
            </h3>
            <div style={{ display: "flex", marginBottom: "8px" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                시험 코드
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {examCode}
              </span>
            </div>
            <div style={{ display: "flex" }}>
              <span
                style={{
                  width: "64px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#64748b",
                }}
              >
                설명
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: "10px",
                  color: "#334155",
                }}
              >
                {examDescription
                  ? stripHtml(examDescription).substring(0, 30) +
                    (examDescription.length > 30 ? "..." : "")
                  : "설명 없음"}
              </span>
            </div>
          </div>
        </div>

        {/* Overall Score */}
        {overallScore !== null && (
          <div
            style={{
              marginBottom: "32px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: "#eff6ff",
              padding: "32px",
              borderRadius: "12px",
              border: "1px solid #bfdbfe",
            }}
          >
            <h3
              style={{
                fontSize: "14px",
                fontWeight: "bold",
                color: "#1e40af",
                marginBottom: "8px",
                margin: "0 0 8px 0",
              }}
            >
              종합 점수
            </h3>
            <div
              style={{
                fontSize: "48px",
                fontWeight: "bold",
                color: "#2563eb",
                marginBottom: "8px",
                margin: "0 0 8px 0",
              }}
            >
              {overallScore}점
            </div>
            <div
              style={{
                marginTop: "8px",
                padding: "4px 16px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "bold",
                borderRadius: "9999px",
              }}
            >
              {getGrade(overallScore)}
            </div>
          </div>
        )}

        {/* AI Summary */}
        {aiSummary && (
          <div style={{ marginBottom: "32px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                color: "#0f172a",
                marginBottom: "16px",
                borderLeft: "4px solid #2563eb",
                paddingLeft: "12px",
                margin: "0 0 16px 0",
              }}
            >
              AI 종합 평가
            </h3>
            <div
              style={{
                backgroundColor: "#fffbeb",
                padding: "24px",
                borderRadius: "8px",
                border: "1px solid #fcd34d",
              }}
            >
              {aiSummary.summary && (
                <p
                  style={{
                    fontSize: "10px",
                    color: "#78350f",
                    lineHeight: 1.6,
                    marginBottom: "16px",
                    margin: "0 0 16px 0",
                  }}
                >
                  {stripHtml(aiSummary.summary)}
                </p>
              )}

              {aiSummary.strengths && aiSummary.strengths.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h4
                    style={{
                      fontSize: "10px",
                      fontWeight: "bold",
                      color: "#92400e",
                      marginBottom: "8px",
                      margin: "0 0 8px 0",
                    }}
                  >
                    주요 강점
                  </h4>
                  <ul style={{ listStyle: "disc inside", padding: 0, margin: 0 }}>
                    {aiSummary.strengths.map((strength, idx) => (
                      <li
                        key={idx}
                        style={{
                          fontSize: "10px",
                          color: "#78350f",
                          marginBottom: "4px",
                        }}
                      >
                        {stripHtml(strength)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiSummary.keyQuotes && aiSummary.keyQuotes.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  {aiSummary.keyQuotes.map((quote, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "12px",
                        backgroundColor: "rgba(255, 255, 255, 0.5)",
                        borderLeft: "4px solid #d97706",
                        borderRadius: "4px",
                        marginBottom: "8px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "9px",
                          fontStyle: "italic",
                          color: "#92400e",
                          margin: 0,
                        }}
                      >
                        "{stripHtml(quote)}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions Detail */}
        <div style={{ marginBottom: "32px" }}>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: "#0f172a",
              marginBottom: "16px",
              borderLeft: "4px solid #2563eb",
              paddingLeft: "12px",
              margin: "0 0 16px 0",
            }}
          >
            문제별 상세 평가
          </h3>
          <div>
            {questions.map((question, idx) => {
              const grade = grades[idx];
              if (!grade) return null;

              return (
                <div
                  key={question.id || idx}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    overflow: "hidden",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: "#f8fafc",
                      padding: "12px 16px",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#334155",
                      }}
                    >
                      문제 {idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#2563eb",
                      }}
                    >
                      {grade.score}점
                    </span>
                  </div>
                  <div style={{ padding: "16px" }}>
                    <p
                      style={{
                        fontSize: "10px",
                        color: "#475569",
                        lineHeight: 1.5,
                        marginBottom: "16px",
                        margin: "0 0 16px 0",
                      }}
                    >
                      {stripHtml(question.prompt)}
                    </p>
                    {grade.comment && (
                      <div
                        style={{
                          backgroundColor: "#f0fdf4",
                          padding: "12px",
                          borderRadius: "6px",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "9px",
                            fontWeight: "bold",
                            color: "#166534",
                            marginBottom: "4px",
                            margin: "0 0 4px 0",
                          }}
                        >
                          평가 코멘트
                        </h4>
                        <p
                          style={{
                            fontSize: "9px",
                            color: "#14532d",
                            lineHeight: 1.4,
                            margin: 0,
                          }}
                        >
                          {stripHtml(grade.comment)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            fontSize: "10px",
            color: "#94a3b8",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            marginTop: "48px",
          }}
        >
          Quest-On 평가 리포트 | 생성일:{" "}
          {new Date().toLocaleDateString("ko-KR")}
        </div>
      </div>
    );
  }
);

ReportCardTemplate.displayName = "ReportCardTemplate";

