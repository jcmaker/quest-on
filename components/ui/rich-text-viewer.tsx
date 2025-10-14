"use client";

interface RichTextViewerProps {
  content: string;
  className?: string;
}

export function RichTextViewer({
  content,
  className = "",
}: RichTextViewerProps) {
  return (
    <div
      className={`prose max-w-none rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
