"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, Download } from "lucide-react";
import { ReportCardTemplate } from "@/components/report/ReportCardTemplate";

interface ReportData {
  exam: {
    title: string;
    code: string;
    questions: Array<{
      id: string;
      idx: number;
      type: string;
      prompt: string;
    }>;
    description?: string;
  };
  session: {
    submitted_at: string;
  };
  grades: Record<number, {
    id: string;
    q_idx: number;
    score: number;
    comment?: string;
  }>;
  overallScore: number | null;
  studentName: string;
  aiSummary?: {
    sentiment?: "positive" | "negative" | "neutral";
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    keyQuotes?: string[];
  };
}

interface QuickActionsCardProps {
  sessionId: string;
  isGraded?: boolean;
  // Optional: If provided, use this data instead of fetching
  reportData?: ReportData;
}

export function QuickActionsCard({
  sessionId,
  isGraded = false,
  reportData: providedReportData,
}: QuickActionsCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(
    providedReportData || null
  );
  const reportTemplateRef = useRef<HTMLDivElement>(null);

  const handleDownloadReportCard = async () => {
    if (!isGraded) {
      alert("평가가 완료되지 않았습니다.");
      return;
    }

    try {
      setDownloading(true);

      // Use provided data or fetch if not available
      let dataToUse = reportData;
      if (!dataToUse) {
        const response = await fetch(`/api/student/session/${sessionId}/report`);
        if (!response.ok) {
          throw new Error("리포트 데이터를 불러올 수 없습니다.");
        }
        const data = await response.json();
        setReportData(data);
        dataToUse = data;
        // Wait a bit for state to update and component to render
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Ensure template is rendered
      if (!reportTemplateRef.current || !dataToUse) {
        throw new Error("PDF 템플릿을 찾을 수 없습니다.");
      }

      // Dynamically import libraries
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      // Wait a bit to ensure styles are loaded
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(reportTemplateRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: "#ffffff",
        foreignObjectRendering: false, // Disable foreignObject rendering which may cause lab() issues
        onclone: (clonedDoc) => {
          // Remove all stylesheets before html2canvas processes them
          try {
            const styleSheets = Array.from(clonedDoc.styleSheets);
            styleSheets.forEach((sheet) => {
              try {
                if (sheet.ownerNode && sheet.ownerNode.parentNode) {
                  sheet.ownerNode.parentNode.removeChild(sheet.ownerNode);
                }
              } catch (e) {
                // Ignore cross-origin or other errors
              }
            });
          } catch (e) {
            // Ignore errors
          }

          // Convert all computed styles to inline RGB
          const clonedElement = clonedDoc.querySelector(
            `[data-pdf-template="true"]`
          ) as HTMLElement;
          
          if (clonedElement && clonedDoc.defaultView) {
            const allElements = [clonedElement, ...clonedElement.querySelectorAll("*")];
            allElements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              try {
                const computedStyle = clonedDoc.defaultView!.getComputedStyle(
                  htmlEl
                );
                
                // Get computed RGB values and set as inline styles
                const bgColor = computedStyle.backgroundColor;
                const color = computedStyle.color;
                const borderColor = computedStyle.borderColor;
                
                if (bgColor && !bgColor.includes("lab") && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
                  htmlEl.style.backgroundColor = bgColor;
                }
                if (color && !color.includes("lab")) {
                  htmlEl.style.color = color;
                }
                if (borderColor && !borderColor.includes("lab") && borderColor !== "rgba(0, 0, 0, 0)" && borderColor !== "transparent") {
                  htmlEl.style.borderColor = borderColor;
                }
              } catch (e) {
                // Ignore errors
              }
            });
          }
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `${dataToUse.exam.title || "시험"}_${dataToUse.studentName || "학생"}_리포트카드.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert(
        error instanceof Error
          ? error.message
          : "PDF 생성 중 오류가 발생했습니다."
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">빠른 작업</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleDownloadReportCard}
            disabled={downloading || !isGraded}
          >
            {downloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                생성 중...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                리포트 카드 다운로드
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start">
            <MessageSquare className="w-4 h-4 mr-2" />
            학생에게 메시지
          </Button>
        </CardContent>
      </Card>

      {/* Hidden Report Card Template for PDF Generation */}
      {(reportData || providedReportData) && (
        <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
          <ReportCardTemplate
            ref={reportTemplateRef}
            examTitle={(reportData || providedReportData)!.exam.title}
            examCode={(reportData || providedReportData)!.exam.code}
            examDescription={(reportData || providedReportData)!.exam.description}
            studentName={(reportData || providedReportData)!.studentName}
            submittedAt={(reportData || providedReportData)!.session.submitted_at}
            overallScore={(reportData || providedReportData)!.overallScore}
            questions={(reportData || providedReportData)!.exam.questions}
            grades={(reportData || providedReportData)!.grades}
            aiSummary={(reportData || providedReportData)!.aiSummary}
          />
        </div>
      )}
    </>
  );
}

