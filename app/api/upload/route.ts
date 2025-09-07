import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server";

// Initialize Supabase client with service role key for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log("Upload API called");

    // Get current user
    const user = await currentUser();
    console.log(
      "User:",
      user ? { id: user.id, role: user.unsafeMetadata?.role } : "No user"
    );

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is instructor
    const userRole = user.unsafeMetadata?.role as string;
    console.log("User role:", userRole);

    if (userRole !== "instructor") {
      return NextResponse.json(
        { error: "Instructor access required" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const fileName = formData.get("fileName") as string;

    console.log("File info:", {
      fileName: fileName,
      fileSize: file?.size,
      fileType: file?.type,
      hasFile: !!file,
    });

    if (!file) {
      console.log("No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
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
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    // Validate file size (5MB for Vercel compatibility)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      console.log(`File size ${file.size} exceeds 5MB limit`);
      return NextResponse.json(
        { error: "File size exceeds 5MB limit. Please use a smaller file." },
        { status: 400 }
      );
    }

    // Sanitize filename to remove special characters and Korean characters
    const sanitizeFileName = (name: string) => {
      // Extract file extension
      const lastDotIndex = name.lastIndexOf(".");
      const extension = lastDotIndex !== -1 ? name.substring(lastDotIndex) : "";
      const nameWithoutExt =
        lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;

      // Replace Korean characters and special characters with safe alternatives
      const sanitized =
        nameWithoutExt
          .replace(/[가-힣]/g, "") // Remove Korean characters
          .replace(/[^a-zA-Z0-9_-]/g, "_") // Replace special chars with underscore
          .replace(/_+/g, "_") // Replace multiple underscores with single
          .replace(/^_|_$/g, "") || // Remove leading/trailing underscores
        "file"; // Fallback if name becomes empty

      return sanitized + extension;
    };

    const sanitizedFileName = sanitizeFileName(fileName);
    const finalFileName = `${Date.now()}-${sanitizedFileName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    console.log("Uploading to Supabase Storage:", {
      bucket: "exam-materials",
      path: `instructor-${user.id}/${finalFileName}`,
      contentType: file.type,
      bufferSize: buffer.length,
    });

    const { data, error } = await supabase.storage
      .from("exam-materials")
      .upload(`instructor-${user.id}/${finalFileName}`, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Supabase storage error:", error);
      console.error("Error details:", {
        message: error.message,
      });
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    console.log("Upload successful:", data);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("exam-materials")
      .getPublicUrl(data.path);

    return NextResponse.json({
      url: urlData.publicUrl,
      fileName: file.name, // Keep original filename for display
      sanitizedFileName: finalFileName, // Include sanitized filename for reference
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("Upload error:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
