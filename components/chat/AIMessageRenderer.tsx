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
    <div className="bg-muted/90 text-foreground border border-border/60 backdrop-blur-sm rounded-3xl rounded-tl-md px-4 py-3 max-w-[55%] shadow-lg shadow-muted/20 transition-all duration-200 hover:shadow-xl hover:shadow-muted/30">
      <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mb-2 prose-p:mb-3 prose-p:last:mb-0">
        {/* HTML 콘텐츠인지 확인하여 조건부 렌더링 */}
        {content.includes("<") &&
        content.includes(">") &&
        /<\/?[a-z][\s\S]*>/i.test(content) ? (
          // HTML 콘텐츠인 경우
          <div
            className="prose prose-sm max-w-none dark:prose-invert [&_*]:text-inherit [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-4 [&_p]:leading-7 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:ml-2 [&_ul]:mb-4 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:ml-2 [&_ol]:mb-4 [&_ol]:space-y-2 [&_li]:leading-7 [&_strong]:font-bold [&_strong]:text-primary/90 [&_em]:italic [&_em]:text-muted-foreground [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r-lg [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-4 [&_code]:bg-muted [&_code]:text-primary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-sm [&_code]:font-mono"
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
                  output: "html", // MathML 대신 HTML만 출력하도록 설정
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
                  <h1 className="text-xl font-bold text-foreground mb-4 mt-6 first:mt-0 border-b pb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }: React.ComponentProps<"h2">) => (
                  <h2 className="text-lg font-bold text-foreground mb-3 mt-6">
                    {children}
                  </h2>
                ),
                h3: ({ children }: React.ComponentProps<"h3">) => (
                  <h3 className="text-base font-semibold text-foreground mb-2 mt-4">
                    {children}
                  </h3>
                ),

                // 문단 스타일링
                p: ({ children }: React.ComponentProps<"p">) => (
                  <p className="text-sm leading-7 mb-4 last:mb-0 text-foreground/90">
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
                    <div className="my-4 rounded-lg overflow-hidden shadow-sm border border-border/50">
                      <div className="bg-muted/50 px-4 py-1 text-xs font-mono text-muted-foreground border-b border-border/50 flex justify-between">
                        <span>{match[1]}</span>
                      </div>
                      <SyntaxHighlighter
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        style={vscDarkPlus as any}
                        language={match[1]}
                        PreTag="div"
                        className="!m-0 !rounded-none !bg-[#1e1e1e]"
                        showLineNumbers={true}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        {...(props as any)}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code
                      className="bg-muted text-primary px-1.5 py-0.5 rounded-md text-xs font-mono border border-border/50"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },

                // 테이블 스타일링
                table: ({ children }: React.ComponentProps<"table">) => (
                  <div className="overflow-x-auto my-4 border border-border/50 rounded-lg shadow-sm bg-white dark:bg-gray-800">
                    <table className="min-w-full divide-y divide-border">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }: React.ComponentProps<"thead">) => (
                  <thead className="bg-primary/10 dark:bg-primary/20 border-b-2 border-primary/20">
                    {children}
                  </thead>
                ),
                tbody: ({ children }: React.ComponentProps<"tbody">) => (
                  <tbody className="divide-y divide-border/50 bg-background">
                    {children}
                  </tbody>
                ),
                tr: ({ children }: React.ComponentProps<"tr">) => (
                  <tr className="transition-colors hover:bg-muted/40 border-b border-border/30 last:border-b-0">
                    {children}
                  </tr>
                ),
                th: ({ children }: React.ComponentProps<"th">) => (
                  <th className="px-4 py-3 text-left text-sm font-bold text-foreground">
                    {children}
                  </th>
                ),
                td: ({ children }: React.ComponentProps<"td">) => (
                  <td className="px-4 py-3 text-sm text-foreground/90 whitespace-normal break-words">
                    {children}
                  </td>
                ),

                // 리스트 스타일링
                ul: ({ children }: React.ComponentProps<"ul">) => (
                  <ul className="list-disc list-outside ml-5 mb-4 space-y-2 marker:text-muted-foreground">
                    {children}
                  </ul>
                ),
                ol: ({ children }: React.ComponentProps<"ol">) => (
                  <ol className="list-decimal list-outside ml-5 mb-4 space-y-2 marker:text-muted-foreground marker:font-medium">
                    {children}
                  </ol>
                ),
                li: ({ children }: React.ComponentProps<"li">) => (
                  <li className="text-sm leading-7 pl-1">{children}</li>
                ),

                // 강조 스타일링
                strong: ({ children }: React.ComponentProps<"strong">) => (
                  <strong className="font-bold text-primary/90">
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
                    className="text-blue-500 hover:text-blue-600 hover:underline transition-colors font-medium"
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
                  <blockquote className="border-l-4 border-primary/30 pl-4 py-1 bg-muted/30 rounded-r-lg italic text-muted-foreground my-4 shadow-sm">
                    {children}
                  </blockquote>
                ),

                // 수학 식 렌더링 (remark-math 플러그인용)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                math: ({ children }: any) => (
                  <div className="my-4 overflow-x-auto p-2 bg-muted/20 rounded-lg text-center">
                    {children}
                  </div>
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                inlineMath: ({ children }: any) => (
                  <span className="inline-block mx-1 px-1 bg-muted/20 rounded">
                    {children}
                  </span>
                ),

                // 수평선
                hr: (): React.ReactElement => (
                  <hr className="border-border my-6" />
                ),

                // 취소선 스타일링 (물결표 오작동 방지)
                del: ({ children }: React.ComponentProps<"del">) => (
                  <span className="no-underline decoration-0">{children}</span>
                ),
              } as Components
            }
          >
            {content}
          </ReactMarkdown>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
          <span className="text-xs font-medium text-muted-foreground">
            AI 답변
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      {content.includes("$") && (
        <div className="mt-1 text-[10px] text-muted-foreground/70 text-right">
          LaTeX 수식 포함됨
        </div>
      )}
    </div>
  );
};

export default AIMessageRenderer;
