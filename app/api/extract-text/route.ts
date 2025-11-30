// Node.js Runtime 사용
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import AdmZip from "adm-zip";

// pdf2json을 사용하여 PDF 텍스트 추출 (Node.js 전용)
// pdf-parse와 pdfjs-dist는 DOMMatrix 등 브라우저 API를 사용하여 Node.js에서 실패함
let PDFParser: any = null;

async function getPDFParser() {
  if (!PDFParser) {
    try {
      console.log("[extract-text] pdf2json 모듈 로드 시도...");
      // pdf2json은 Node.js 전용이므로 안전하게 사용 가능
      const pdf2jsonModule = await import("pdf2json");
      PDFParser = pdf2jsonModule.default || pdf2jsonModule;
      console.log("[extract-text] pdf2json 모듈 로드 성공");
    } catch (error) {
      console.error("[extract-text] pdf2json 모듈 로드 실패:", error);
      throw new Error(`pdf2json 모듈을 로드할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return PDFParser;
}

// Supabase 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * PDF 파일에서 텍스트 추출 (pdf2json 사용 - Node.js 전용)
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const PDFParserClass = await getPDFParser();
    console.log("[extract-text] PDF 파싱 시작, buffer 크기:", buffer.length);
    
    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParserClass(null, 1);
      const textParts: string[] = [];
      
      // 텍스트 추출 이벤트 핸들러
      pdfParser.on("pdfParser_dataError", (errData: any) => {
        console.error("[extract-text] PDF 파싱 에러:", errData);
        reject(new Error(`PDF 파싱 실패: ${errData.parserError || "알 수 없는 오류"}`));
      });
      
      pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
        try {
          // 모든 페이지에서 텍스트 추출
          if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
            for (const page of pdfData.Pages) {
              if (page.Texts && Array.isArray(page.Texts)) {
                const pageTexts = page.Texts.map((textObj: any) => {
                  // R 배열에서 텍스트 추출
                  if (textObj.R && Array.isArray(textObj.R)) {
                    return textObj.R.map((r: any) => r.T || "").join("");
                  }
                  return "";
                }).filter((text: string) => text.trim());
                
                if (pageTexts.length > 0) {
                  textParts.push(pageTexts.join(" "));
                }
              }
            }
          }
          
          const extractedText = textParts.join("\n\n");
          console.log("[extract-text] PDF 파싱 완료, 텍스트 길이:", extractedText.length);
          resolve(extractedText);
        } catch (error) {
          console.error("[extract-text] 텍스트 추출 중 에러:", error);
          reject(new Error(`텍스트 추출 실패: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
      
      // PDF 파싱 시작
      pdfParser.parseBuffer(buffer);
    });
  } catch (error) {
    console.error("PDF 텍스트 추출 실패:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("PDF 추출 에러 상세:", { errorMessage, errorStack });
    throw new Error(`PDF 파일에서 텍스트를 추출할 수 없습니다: ${errorMessage}`);
  }
}

/**
 * Word 파일(.docx)에서 텍스트 추출
 */
async function extractTextFromWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (error) {
    console.error("Word 텍스트 추출 실패:", error);
    throw new Error("Word 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * PPT 파일(.pptx)에서 텍스트 추출
 * PPTX는 ZIP 파일이므로 압축을 풀고 XML에서 텍스트 추출
 */
async function extractTextFromPPT(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    
    const textParts: string[] = [];
    
    // ppt/slides/ 폴더의 모든 슬라이드 파일 찾기
    const slideFiles = zipEntries.filter(entry => 
      entry.entryName.startsWith("ppt/slides/slide") && 
      entry.entryName.endsWith(".xml")
    );
    
    // 슬라이드 번호 순서대로 정렬
    slideFiles.sort((a, b) => {
      const aNum = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || "0");
      const bNum = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || "0");
      return aNum - bNum;
    });
    
    // 각 슬라이드에서 텍스트 추출
    for (const slide of slideFiles) {
      const slideXml = slide.getData().toString("utf-8");
      
      // XML에서 <a:t> 태그 안의 텍스트 추출 (PowerPoint의 텍스트 노드)
      const textMatches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
      if (textMatches) {
        for (const match of textMatches) {
          const text = match.replace(/<[^>]*>/g, "").trim();
          if (text) {
            textParts.push(text);
          }
        }
      }
      
      // <p:sp> (shape) 내부의 텍스트도 추출
      const shapeMatches = slideXml.match(/<p:sp[^>]*>[\s\S]*?<\/p:sp>/g);
      if (shapeMatches) {
        for (const shape of shapeMatches) {
          const shapeTextMatches = shape.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
          if (shapeTextMatches) {
            for (const match of shapeTextMatches) {
              const text = match.replace(/<[^>]*>/g, "").trim();
              if (text && !textParts.includes(text)) {
                textParts.push(text);
              }
            }
          }
        }
      }
    }
    
    return textParts.join("\n\n");
  } catch (error) {
    console.error("PPT 텍스트 추출 실패:", error);
    throw new Error("PPT 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * CSV 파일에서 텍스트 추출
 */
async function extractTextFromCSV(buffer: Buffer): Promise<string> {
  try {
    // CSV는 텍스트 파일이므로 UTF-8로 디코딩
    const text = buffer.toString("utf-8");
    return text;
  } catch (error) {
    console.error("CSV 텍스트 추출 실패:", error);
    throw new Error("CSV 파일에서 텍스트를 추출할 수 없습니다.");
  }
}

/**
 * 파일 형식에 따라 텍스트 추출
 */
async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  // PDF
  if (mimeType === "application/pdf" || extension === "pdf") {
    return await extractTextFromPDF(buffer);
  }

  // Word (.docx)
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return await extractTextFromWord(buffer);
  }

  // Word (.doc) - mammoth는 docx만 지원하므로 에러 처리
  if (mimeType === "application/msword" || extension === "doc") {
    throw new Error(".doc 형식은 지원되지 않습니다. .docx 형식으로 변환해주세요.");
  }

  // PPT (.pptx)
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    extension === "pptx"
  ) {
    return await extractTextFromPPT(buffer);
  }

  // PPT (.ppt)
  if (
    mimeType === "application/vnd.ms-powerpoint" ||
    extension === "ppt"
  ) {
    throw new Error(".ppt 형식은 지원되지 않습니다. .pptx 형식으로 변환해주세요.");
  }

  // CSV
  if (
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    extension === "csv"
  ) {
    return await extractTextFromCSV(buffer);
  }

  throw new Error(`지원되지 않는 파일 형식: ${mimeType || extension}`);
}

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 강사 권한 확인
    const userRole = user.unsafeMetadata?.role as string;
    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { fileUrl, fileName, mimeType } = body;

    if (!fileUrl) {
      return NextResponse.json(
        { error: "fileUrl is required" },
        { status: 400 }
      );
    }

    // Supabase Storage에서 파일 다운로드
    // fileUrl에서 storage path 추출
    const urlParts = fileUrl.split("/");
    const storagePath = urlParts.slice(urlParts.indexOf("exam-materials") + 1).join("/");

    console.log("[extract-text] Downloading file from storage:", storagePath);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("exam-materials")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("[extract-text] Download error:", downloadError);
      return NextResponse.json(
        { error: "파일을 다운로드할 수 없습니다." },
        { status: 500 }
      );
    }

    // ArrayBuffer를 Buffer로 변환
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 텍스트 추출
    const extractedText = await extractTextFromFile(
      buffer,
      fileName || storagePath,
      mimeType || ""
    );

    return NextResponse.json({
      success: true,
      text: extractedText,
      length: extractedText.length,
    });
  } catch (error) {
    console.error("[extract-text] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : undefined;
    
    // fileName과 mimeType은 try 블록 내에서만 사용 가능
    const errorFileName = typeof fileName !== "undefined" ? fileName : "unknown";
    const errorMimeType = typeof mimeType !== "undefined" ? mimeType : "unknown";
    const errorFileUrl = typeof fileUrl !== "undefined" ? fileUrl?.substring(0, 100) : "unknown";
    
    console.error("[extract-text] Error details:", {
      name: errorName,
      message: errorMessage,
      stack: errorStack,
      fileName: errorFileName,
      mimeType: errorMimeType,
      fileUrl: errorFileUrl,
      errorType: typeof error,
      errorString: String(error),
    });
    
    // 항상 JSON 응답 반환 (빈 응답 방지)
    try {
      return NextResponse.json(
        {
          error: errorMessage || "알 수 없는 오류가 발생했습니다.",
          message: errorMessage, // 호환성을 위해 message도 추가
          details: process.env.NODE_ENV === "development" ? {
            stack: errorStack,
            name: errorName,
          } : undefined,
        },
        { status: 500 }
      );
    } catch (jsonError) {
      // JSON 응답 생성 실패 시에도 에러 반환
      console.error("[extract-text] JSON 응답 생성 실패:", jsonError);
      return new NextResponse(
        JSON.stringify({
          error: errorMessage || "알 수 없는 오류가 발생했습니다.",
          message: errorMessage || "알 수 없는 오류가 발생했습니다.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
}

