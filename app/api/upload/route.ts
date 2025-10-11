import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";
import { randomUUID } from "crypto";
import sharp from "sharp";

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 표준화된 에러 응답 헬퍼
function errorJson(
  code: string,
  message: string,
  details?: unknown,
  status = 400
) {
  const traceId = randomUUID();
  console.error(`[${traceId}] ${code}:`, message, details);
  return NextResponse.json(
    { ok: false, code, message, details, traceId },
    { status }
  );
}

// 안전한 저장용 key 생성 (원본명은 메타데이터로만 저장)
function makeSafeObjectKey(originalName: string, extFallback = ".bin") {
  const ts = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const id = randomUUID();
  // 확장자 추출 (마지막 점 기준, 너무 긴/이상한 건 버림)
  const m = originalName.match(/\.([a-zA-Z0-9]{1,8})$/);
  const ext = m ? `.${m[1].toLowerCase()}` : extFallback;
  // 슬래시를 언더스코어로 변경 (일부 storage는 중첩 폴더 미지원)
  return `${ts}_${id}${ext}`;
}

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS(request: NextRequest) {
  console.log("[upload] OPTIONS request received:", {
    url: request.url,
    method: request.method,
  });
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        Allow: "POST, OPTIONS",
      },
    }
  );
}

// GET 요청에 대한 명확한 에러 처리
export async function GET(request: NextRequest) {
  console.log("[upload] GET request received (NOT ALLOWED):", {
    url: request.url,
    method: request.method,
  });
  return errorJson(
    "METHOD_NOT_ALLOWED",
    "GET 메서드는 지원하지 않습니다. POST 메서드를 사용하세요.",
    { allowedMethods: ["POST", "OPTIONS"] },
    405
  );
}

export async function POST(request: NextRequest) {
  let objectKey: string | null = null;

  try {
    console.log("[upload] POST request received:", {
      url: request.url,
      method: request.method,
      contentType: request.headers.get("content-type"),
    });

    // 환경 변수 확인
    console.log("[upload] Environment check:", {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrlPrefix:
        process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + "...",
    });

    // Supabase 연결 테스트
    try {
      const { data: buckets, error: listError } =
        await supabase.storage.listBuckets();
      console.log("[upload] Supabase connection test:", {
        canListBuckets: !listError,
        bucketsFound: buckets?.length || 0,
        hasExamMaterials: buckets?.some((b) => b.name === "exam-materials"),
        listError: listError?.message,
      });
    } catch (testError) {
      console.error("[upload] Supabase connection failed:", testError);
    }

    // Get current user
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", null, 401);
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    console.log("[upload] User:", { id: user.id, role: userRole });

    if (userRole !== "instructor") {
      return errorJson(
        "FORBIDDEN",
        "강사 권한이 필요합니다.",
        { userRole, userId: user.id },
        403
      );
    }

    // 반드시 form-data로만 받기 (쿼리에 파일명 넣지 않기)
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const originalName = file?.name || "unnamed";

    if (!file) {
      return errorJson("NO_FILE", "파일이 존재하지 않습니다.", null, 400);
    }

    // Validate file type (화이트리스트)
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return errorJson(
        "INVALID_FILE_TYPE",
        "지원되지 않는 파일 형식입니다.",
        { fileType: file.type, allowedTypes },
        400
      );
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return errorJson(
        "FILE_TOO_LARGE",
        "파일 크기가 50MB를 초과합니다.",
        { fileSize: file.size, maxSize },
        413
      );
    }

    // 안전한 저장용 키 생성 (원본명은 메타데이터로만)
    objectKey = makeSafeObjectKey(originalName);

    // Supabase Storage 경로: instructor-{userId}/{objectKey}
    // objectKey는 이미 날짜/uuid.ext 형식이므로 그대로 사용
    const storagePath = `instructor-${user.id}/${objectKey}`;

    console.log("[upload] Storage path generated:", {
      originalName,
      objectKey,
      storagePath,
      fileSize: file.size,
      fileType: file.type,
      userId: user.id,
    });

    // Convert file to buffer and compress if needed
    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Compress images for AI processing (maintain text readability)
    if (file.type.startsWith("image/")) {
      try {
        const compressedBuffer = await sharp(buffer)
          .jpeg({ quality: 70, progressive: true }) // Good balance for AI text recognition
          .png({ compressionLevel: 6, progressive: true })
          .webp({ quality: 70 })
          .toBuffer();

        // Only use compressed version if it's significantly smaller
        if (compressedBuffer.length < buffer.length * 0.8) {
          buffer = Buffer.from(compressedBuffer.buffer as ArrayBuffer);
          console.log(
            `Image compressed: ${arrayBuffer.byteLength} → ${buffer.length} bytes`
          );
        }
      } catch (compressionError) {
        console.log(
          "Image compression failed, using original:",
          compressionError
        );
        // Continue with original buffer if compression fails
      }
    }

    console.log("[upload] Uploading to Supabase:", {
      bucket: "exam-materials",
      path: storagePath,
      bufferSize: buffer.length,
      contentType: file.type,
    });

    // Supabase Storage 업로드 시도
    const { data, error } = await supabase.storage
      .from("exam-materials")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true, // 임시로 덮어쓰기 허용 (중복 파일 에러 방지)
      });

    console.log("[upload] Supabase response:", {
      hasData: !!data,
      hasError: !!error,
      dataPath: data?.path,
      errorMessage: error?.message,
      errorDetails: error,
    });

    if (error) {
      console.error("[upload] Supabase storage error details:", {
        message: error.message,
        name: error.name,
        statusCode: (error as { statusCode?: number }).statusCode,
        error: JSON.stringify(error, null, 2),
        storagePath: storagePath,
        bucket: "exam-materials",
      });

      // 에러 타입별 구체적인 메시지
      let userMessage = "파일 저장 중 오류가 발생했습니다.";
      let errorCode = "STORAGE_ERROR";

      if (error.message.includes("Bucket not found")) {
        userMessage = "스토리지 버킷을 찾을 수 없습니다.";
        errorCode = "BUCKET_NOT_FOUND";
      } else if (
        error.message.includes("row-level security") ||
        error.message.includes("policy")
      ) {
        userMessage = "파일 업로드 권한이 없습니다. RLS 정책을 확인하세요.";
        errorCode = "POLICY_VIOLATION";
      } else if (error.message.includes("already exists")) {
        userMessage = "같은 이름의 파일이 이미 존재합니다.";
        errorCode = "FILE_EXISTS";
      } else if (
        error.message.includes("Invalid JWT") ||
        error.message.includes("JWT")
      ) {
        userMessage = "인증 토큰이 유효하지 않습니다.";
        errorCode = "INVALID_TOKEN";
      }

      return errorJson(
        errorCode,
        userMessage,
        {
          originalError: error.message,
          storagePath: storagePath,
          bucket: "exam-materials",
          hint: "서버 로그에서 [upload] Supabase storage error details를 확인하세요.",
        },
        500
      );
    }

    console.log("[upload] Upload successful:", data.path);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("exam-materials")
      .getPublicUrl(data.path);

    // 표준화된 성공 응답 (원본명은 메타데이터로만)
    return NextResponse.json(
      {
        ok: true,
        objectKey: data.path, // 클라이언트는 이 key로만 접근
        url: urlData.publicUrl,
        meta: {
          originalName: originalName,
          size: file.size,
          mime: file.type,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[upload] Unexpected error:", error);

    // 구조화된 에러 응답
    return errorJson(
      "UPLOAD_FAILED",
      "업로드 중 예상치 못한 오류가 발생했습니다.",
      {
        error: error instanceof Error ? error.message : String(error),
        objectKey,
      },
      500
    );
  }
}
