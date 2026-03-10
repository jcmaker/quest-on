/**
 * Client-side file upload utility.
 * - Files <= 4MB: upload via /api/upload (server proxies to Supabase with service key)
 * - Files > 4MB: get signed URL from /api/upload/signed-url, upload directly to Supabase
 */

const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4MB

export interface UploadResult {
  url: string;
  objectKey?: string;
  meta: {
    originalName: string;
    size: number;
    mime: string;
  };
}

async function uploadViaServer(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `서버 업로드 실패 (${response.status})`
    );
  }

  const result = await response.json();
  if (!result.ok || !result.url) {
    throw new Error(result.message || "서버 업로드 실패");
  }

  return {
    url: result.url,
    objectKey: result.objectKey,
    meta: result.meta,
  };
}

async function uploadViaSignedUrl(file: File): Promise<UploadResult> {
  // Step 1: Get signed upload URL from server
  const signedUrlResponse = await fetch("/api/upload/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    }),
  });

  if (!signedUrlResponse.ok) {
    const errorData = await signedUrlResponse.json().catch(() => ({}));
    throw new Error(
      errorData.message || `Signed URL 생성 실패 (${signedUrlResponse.status})`
    );
  }

  const { signedUrl, token, publicUrl, storagePath, meta } =
    await signedUrlResponse.json();

  // Step 2: Upload file directly to Supabase using signed URL
  const uploadResponse = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    // If signed upload fails, try uploading with the token-based approach
    // Supabase signed upload URL uses `uploadToSignedUrl` which expects
    // the token as a query param
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.storage
      .from("exam-materials")
      .uploadToSignedUrl(storagePath, token, file, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      throw new Error(`파일 업로드 실패: ${error.message}`);
    }
  }

  return {
    url: publicUrl,
    objectKey: storagePath,
    meta,
  };
}

export async function uploadFile(file: File): Promise<UploadResult> {
  if (file.size <= SERVER_UPLOAD_LIMIT) {
    return uploadViaServer(file);
  }
  return uploadViaSignedUrl(file);
}
