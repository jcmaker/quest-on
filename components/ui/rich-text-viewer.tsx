"use client";

import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { renderMathInHtml } from "@/lib/math-formatting";

interface RichTextViewerProps {
  content: string;
  className?: string;
}

export function RichTextViewer({
  content,
  className = "",
}: RichTextViewerProps) {
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
      "code", "a", "img", "table", "thead", "tbody", "tr", "th", "td",
      "span", "div", "sup", "sub", "hr",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "class", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
  const renderedContent = renderMathInHtml(sanitized);

  return (
    <div
      data-testid="rich-text-content"
      className={`prose max-w-none rich-text-content overflow-x-auto [&_.qa-math-block]:max-w-full [&_.qa-math-block]:overflow-x-auto [&_.katex-display]:overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}
