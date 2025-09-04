"use client";

import React, { useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface AIMessageRendererProps {
  content: string;
  timestamp: string;
}

const AIMessageRenderer: React.FC<AIMessageRendererProps> = ({
  content,
  timestamp,
}) => {
  // HTML 콘텐츠에 수학 식이 있을 경우 KaTeX 렌더링
  useEffect(() => {
    if (
      content.includes("<") &&
      content.includes(">") &&
      /<\/?[a-z][\s\S]*>/i.test(content)
    ) {
      // HTML 콘텐츠인 경우 KaTeX 렌더링
      if (typeof window !== "undefined" && window.katex) {
        // 수학 식이 포함된 요소들을 찾아서 KaTeX로 렌더링
        const mathElements = document.querySelectorAll(".katex-math");
        mathElements.forEach((element) => {
          try {
            window.katex.render(
              element.textContent || "",
              element as HTMLElement,
              {
                throwOnError: false,
                errorColor: "#cc0000",
              }
            );
          } catch (error) {
            console.warn("KaTeX rendering failed:", error);
          }
        });
      }
    }
  }, [content]);

  return (
    <div className="bg-muted/80 text-foreground border border-border/50 backdrop-blur-sm rounded-2xl px-3 py-2 max-w-[55%] shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mb-2 prose-p:mb-3 prose-p:last:mb-0">
        {/* HTML 콘텐츠인지 확인하여 조건부 렌더링 */}
        {content.includes("<") &&
        content.includes(">") &&
        /<\/?[a-z][\s\S]*>/i.test(content) ? (
          // HTML 콘텐츠인 경우
          <div
            className="prose prose-sm max-w-none dark:prose-invert [&_*]:text-inherit [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-2 [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:ml-4 [&_ul]:mb-2 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:ml-4 [&_ol]:mb-2 [&_ol]:space-y-1 [&_li]:text-sm [&_li]:leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_em]:text-muted-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-2 [&_code]:bg-muted-foreground/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          // 마크다운 콘텐츠인 경우
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              [
                rehypeKatex,
                {
                  throwOnError: false,
                  errorColor: "#cc0000",
                  displayMode: false, // 기본적으로 인라인 모드
                  fleqn: false, // 왼쪽 정렬 사용 안 함
                  macros: {
                    "\\RR": "\\mathbb{R}",
                    "\\NN": "\\mathbb{N}",
                    "\\ZZ": "\\mathbb{Z}",
                    "\\QQ": "\\mathbb{Q}",
                    "\\CC": "\\mathbb{C}",
                  },
                },
              ],
            ]}
            components={
              {
                // 헤더 스타일링
                h1: ({ children }: React.ComponentProps<"h1">) => (
                  <h1 className="text-lg font-bold text-foreground mb-2 mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }: React.ComponentProps<"h2">) => (
                  <h2 className="text-base font-semibold text-foreground mb-2 mt-3">
                    {children}
                  </h2>
                ),
                h3: ({ children }: React.ComponentProps<"h3">) => (
                  <h3 className="text-sm font-medium text-foreground mb-1 mt-2">
                    {children}
                  </h3>
                ),

                // 문단 스타일링
                p: ({ children }: React.ComponentProps<"p">) => (
                  <p className="text-sm leading-relaxed mb-2 last:mb-0">
                    {children}
                  </p>
                ),

                // 코드 블록 스타일링
                code: ({
                  node,
                  className,
                  children,
                  ...props
                }: React.ComponentProps<"code"> & { node?: Element }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match || (node && node.tagName !== "PRE");
                  return !isInline && match ? (
                    <SyntaxHighlighter
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      style={vscDarkPlus as any}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md text-xs my-2"
                      showLineNumbers={false}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      {...(props as any)}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  ) : (
                    <code
                      className="bg-muted-foreground/20 px-1 py-0.5 rounded text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },

                // 테이블 스타일링
                table: ({ children }: React.ComponentProps<"table">) => (
                  <div className="overflow-x-auto my-3 border border-border/30 rounded-lg bg-background/50">
                    <table className="min-w-full">{children}</table>
                  </div>
                ),
                thead: ({ children }: React.ComponentProps<"thead">) => (
                  <thead className="bg-primary/5 border-b border-primary/20">
                    {children}
                  </thead>
                ),
                tbody: ({ children }: React.ComponentProps<"tbody">) => (
                  <tbody>{children}</tbody>
                ),
                tr: ({ children }: React.ComponentProps<"tr">) => (
                  <tr className="border-b border-border/20 last:border-b-0 hover:bg-muted/20 transition-colors">
                    {children}
                  </tr>
                ),
                th: ({ children }: React.ComponentProps<"th">) => (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                    {children}
                  </th>
                ),
                td: ({ children }: React.ComponentProps<"td">) => (
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {children}
                  </td>
                ),

                // 리스트 스타일링
                ul: ({ children }: React.ComponentProps<"ul">) => (
                  <ul className="list-disc list-inside ml-4 mb-2 space-y-1">
                    {children}
                  </ul>
                ),
                ol: ({ children }: React.ComponentProps<"ol">) => (
                  <ol className="list-decimal list-inside ml-4 mb-2 space-y-1">
                    {children}
                  </ol>
                ),
                li: ({ children }: React.ComponentProps<"li">) => (
                  <li className="text-sm leading-relaxed">{children}</li>
                ),

                // 강조 스타일링
                strong: ({ children }: React.ComponentProps<"strong">) => (
                  <strong className="font-semibold text-foreground">
                    {children}
                  </strong>
                ),
                em: ({ children }: React.ComponentProps<"em">) => (
                  <em className="italic text-muted-foreground">{children}</em>
                ),

                // 링크 스타일링
                a: ({ children, href }: React.ComponentProps<"a">) => (
                  <a
                    href={href}
                    className="text-primary hover:text-primary/80 underline underline-offset-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),

                // 인용구 스타일링
                blockquote: ({
                  children,
                }: React.ComponentProps<"blockquote">) => (
                  <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-2">
                    {children}
                  </blockquote>
                ),

                // 수학 식 렌더링 (remark-math 플러그인용)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                math: ({ children }: any) => (
                  <div className="my-4 overflow-x-auto">{children}</div>
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                inlineMath: ({ children }: any) => (
                  <span className="inline-block mx-1">{children}</span>
                ),

                // 수평선
                hr: (): React.ReactElement => (
                  <hr className="border-border/50 my-3" />
                ),
              } as Components
            }
          >
            {content}
          </ReactMarkdown>
        )}
      </div>

      <div className="mt-2 pt-1 border-t border-border/20">
        <p className="text-xs opacity-70 text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {content.includes("$") && (
          <p className="text-xs text-muted-foreground mt-0.5">
            💡 수학 식은 LaTeX 형식으로 작성됩니다: $인라인$ 또는 $$블록$$
          </p>
        )}
      </div>
    </div>
  );
};

export default AIMessageRenderer;
