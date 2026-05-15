/**
 * Quest-On 강사 AI 에이전트 — 러너 (에이전트 루프)
 *
 * runAgentTurn 의 시그니처는 /api/agent/* 라우트가 의존하므로 변경 금지.
 *
 * MVP 설계:
 *  - OpenAI Chat Completions function calling 루프.
 *  - 대화 상태는 OpenAI 에 저장하지 않고(last_response_id 미사용) 매 턴
 *    메모리상 messages[] 로만 관리한다. 한 턴이 한 요청 안에서 끝난다.
 *  - 모든 스텝은 appendAgentStep 으로 DB 에 남긴다 — 강사가 보는 감사 추적.
 *  - 에이전트 수준 오류는 throw 하지 않고 status="failed" 로 기록한다.
 *    runId 가 존재하지 않을 때만 throw.
 */

import type OpenAI from "openai";

import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { buildAiTextMetadata, callTrackedChatCompletion } from "@/lib/ai-tracking";
import { logError } from "@/lib/logger";
import {
  type AgentRunRecord,
  appendAgentStep,
  getAgentRun,
  patchAgentRun,
} from "@/lib/agent/store";
import {
  getAgentTool,
  getOpenAIToolDefinitions,
} from "@/lib/agent/tools";
import type { ExamDraftPayload } from "@/lib/agent/types";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

/** 한 턴에서 OpenAI 를 호출할 최대 횟수 (무한 툴콜 방지). */
const MAX_ITERATIONS = 8;

const AGENT_ROUTE = "/api/agent/runs";

/** 메모리상 누적되는 비용/토큰. */
interface UsageAccumulator {
  tokensUsed: number;
  costUsdMicros: number;
}

/** input.pageContext 를 시스템 프롬프트에 녹일 한 줄 설명으로 변환. */
function describePageContext(record: AgentRunRecord): string {
  const ctx = record.input?.pageContext;
  if (!ctx) return "강사의 현재 위치 정보 없음.";
  const parts = [`경로: ${ctx.route}`];
  if (ctx.label) parts.push(`화면: ${ctx.label}`);
  if (ctx.examId) parts.push(`시험 ID: ${ctx.examId}`);
  return parts.join(" / ");
}

function buildSystemPrompt(record: AgentRunRecord): string {
  return [
    "너는 강사의 시험 출제를 돕는 Quest-On 에이전트다.",
    "다음 순서로 진행하라: 계획 수립 → generate_questions → assemble_exam_draft.",
    "",
    "원칙:",
    "- 먼저 강사의 요청을 분석해 어떤 시험을 만들지 짧게 계획을 설명한다.",
    "- generate_questions 로 문제를 만든다. 각 문제에는 문제별 루브릭이 함께 생성된다.",
    "- 특정 문제를 다듬어야 하면 revise_question 을 사용한다.",
    "- assemble_exam_draft 를 호출할 때 각 문제의 루브릭(generate_questions 결과)을 그대로 포함하라.",
    "- 모든 문제가 준비되면 assemble_exam_draft 를 단 한 번 호출해 draft 를 확정한다.",
    "- assemble_exam_draft 를 호출하면 턴이 종료되고 강사 승인 대기로 넘어간다.",
    "- 강사의 요청에 시험 시간/난이도/언어가 없으면 합리적인 기본값을 선택한다.",
    "",
    `강사의 현재 위치: ${describePageContext(record)}`,
  ].join("\n");
}

/**
 * 이번 턴의 지시문 — steps 중 가장 마지막 user_input 스텝의 content.
 * 라우트가 runAgentTurn 호출 전에 user_input 스텝을 추가해 둔다.
 */
function getLatestInstruction(record: AgentRunRecord): string | null {
  for (let i = record.steps.length - 1; i >= 0; i--) {
    const step = record.steps[i];
    if (step.stepType === "user_input") {
      return step.content;
    }
  }
  // user_input 스텝이 없으면 최초 생성 시의 input.prompt 로 폴백.
  return record.input?.prompt ?? null;
}

/** 현재 draft(있다면)를 수정 턴 컨텍스트로 직렬화한다. */
function buildCurrentDraftContext(draft: ExamDraftPayload): string {
  return [
    "현재 검토 중인 시험 draft (강사가 수정을 요청했다):",
    "```json",
    JSON.stringify(draft, null, 2),
    "```",
    "위 draft 를 강사의 지시에 맞게 수정한 뒤, assemble_exam_draft 로 새 draft 를 확정하라.",
  ].join("\n");
}

/** OpenAI 를 한 번 호출하고 비용을 누적한다. */
async function callModel(
  messages: ChatMessage[],
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ctx: { runId: string; userId: string },
  usage: UsageAccumulator
): Promise<ChatCompletion> {
  const tracked = await callTrackedChatCompletion(
    () =>
      getOpenAI().chat.completions.create({
        model: AI_MODEL,
        messages,
        tools,
      }),
    {
      feature: "instructor_agent",
      route: AGENT_ROUTE,
      model: AI_MODEL,
      userId: ctx.userId,
      metadata: buildAiTextMetadata({
        extra: {
          agent_phase: "loop_step",
          run_id: ctx.runId,
        },
      }),
    }
  );

  usage.tokensUsed += tracked.usage?.totalTokens ?? 0;
  usage.costUsdMicros += tracked.estimatedCostUsdMicros;
  return tracked.data;
}

export async function runAgentTurn(runId: string): Promise<AgentRunRecord> {
  // ── 1. 로드 ────────────────────────────────────────────────
  const initial = await getAgentRun(runId);
  if (!initial) {
    throw new Error(`runAgentTurn: agent_run not found: ${runId}`);
  }

  const usage: UsageAccumulator = {
    tokensUsed: initial.tokensUsed,
    costUsdMicros: initial.costUsdMicros,
  };

  try {
    await patchAgentRun(runId, { status: "running", error: null });

    // ── 2. 지시문 + 컨텍스트 ────────────────────────────────
    const instruction = getLatestInstruction(initial);
    if (!instruction || instruction.trim().length === 0) {
      throw new Error("러너: 처리할 강사 지시문이 없습니다.");
    }

    // 수정(revision) 턴 판별 — output(이전 draft)이 있으면 수정 턴이다.
    // status 로 판별하지 않는다: /messages 라우트가 턴 시작 시 status 를
    // queued 로 되돌리므로 러너 시점의 status 는 신뢰할 수 없다.
    const isRevision = initial.output != null;

    const ctx = { runId, userId: initial.actorId };

    // ── 3. 시스템 프롬프트 + 초기 messages ──────────────────
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(initial) },
    ];
    if (isRevision && initial.output) {
      messages.push({
        role: "user",
        content: buildCurrentDraftContext(initial.output),
      });
    }
    messages.push({ role: "user", content: instruction });

    const tools = getOpenAIToolDefinitions();
    let finalDraft: ExamDraftPayload | null = null;

    // ── 4. 툴콜 루프 ─────────────────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // 4-0. 협조적 취소 확인 — 취소는 루프 시작 후 들어오므로 매 반복마다
      //      DB 에서 최신 상태를 다시 읽어야 한다(initial 캐시 사용 불가).
      const current = await getAgentRun(runId);
      if (current?.cancelRequested) {
        if (initial.output) {
          // 수정 턴 — 이전 draft 가 있으므로 살려서 다시 승인 가능하게 되돌린다.
          await patchAgentRun(runId, {
            status: "waiting_approval",
            cancelRequested: false,
          });
          await appendAgentStep(runId, {
            stepType: "analysis",
            title: "작업 중단",
            content:
              "강사 요청으로 수정 작업을 중단했습니다. 이전 draft 가 유지됩니다.",
          });
        } else {
          // 최초 턴 — draft 가 없으므로 런을 취소 상태로 종료한다.
          await patchAgentRun(runId, {
            status: "cancelled",
            cancelRequested: false,
          });
          await appendAgentStep(runId, {
            stepType: "analysis",
            title: "작업 중단",
            content: "강사 요청으로 에이전트 작업을 중단했습니다.",
          });
        }
        // 취소는 깨끗한 종료 — throw 하지 않고, !finalDraft → failed 처리로
        // 흘러가지 않도록 여기서 즉시 최신 record 를 반환한다.
        const cancelledRecord = await getAgentRun(runId);
        if (!cancelledRecord) {
          throw new Error(`runAgentTurn: agent_run disappeared: ${runId}`);
        }
        return cancelledRecord;
      }

      const completion = await callModel(messages, tools, ctx, usage);
      const choice = completion.choices[0];
      const assistantMessage = choice?.message;
      if (!assistantMessage) {
        throw new Error("러너: OpenAI 응답에 메시지가 없습니다.");
      }

      const toolCalls = assistantMessage.tool_calls ?? [];

      // 4a. 어시스턴트가 텍스트(계획/분석)를 냈으면 스텝으로 기록.
      const text = assistantMessage.content?.trim();
      if (text) {
        const stepType = iteration === 0 ? "plan" : "analysis";
        await appendAgentStep(runId, {
          stepType,
          title: stepType === "plan" ? "작업 계획" : "분석",
          content: text,
        });
      }

      // 4b. 어시스턴트 메시지를 대화 히스토리에 추가.
      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? "",
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });

      // 4c. 툴콜이 없으면 — 모델이 더 할 일이 없다고 판단. 루프 종료.
      if (toolCalls.length === 0) {
        break;
      }

      // 4d. 각 툴콜 실행.
      let assembleHandled = false;
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
        const toolName = toolCall.function.name;
        const tool = getAgentTool(toolName);

        // 인자 파싱.
        let args: Record<string, unknown> = {};
        let parseError: string | null = null;
        try {
          const raw = toolCall.function.arguments;
          args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch (err) {
          parseError = `툴 인자 파싱 실패: ${
            err instanceof Error ? err.message : String(err)
          }`;
        }

        if (!tool) {
          const message = `알 수 없는 툴: ${toolName}`;
          await appendAgentStep(runId, {
            stepType: "tool_call",
            title: `툴 호출 실패: ${toolName}`,
            content: message,
            metadata: { toolName, args, error: message },
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: message }),
          });
          continue;
        }

        if (parseError) {
          await appendAgentStep(runId, {
            stepType: "tool_call",
            title: `툴 호출 실패: ${toolName}`,
            content: parseError,
            metadata: { toolName, error: parseError },
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: parseError }),
          });
          continue;
        }

        // 툴 실행.
        try {
          const execution = await tool.execute(args, ctx);
          usage.tokensUsed += execution.tokensUsed;
          usage.costUsdMicros += execution.costUsdMicros;

          await appendAgentStep(runId, {
            stepType: "tool_call",
            title: `툴 실행: ${toolName}`,
            content: `${toolName} 툴을 실행했습니다.`,
            metadata: { toolName, args, result: execution.result },
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(execution.result),
          });

          // 터미널 툴: draft 확정.
          if (tool.terminal) {
            const result = execution.result as { draft?: ExamDraftPayload };
            if (result?.draft) {
              finalDraft = result.draft;
              assembleHandled = true;
            }
          }
        } catch (toolError) {
          const message =
            toolError instanceof Error
              ? toolError.message
              : String(toolError);
          await appendAgentStep(runId, {
            stepType: "tool_call",
            title: `툴 실행 실패: ${toolName}`,
            content: message,
            metadata: { toolName, args, error: message },
          });
          // 실패를 모델에 알려 재시도/대안을 유도한다.
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: message }),
          });
        }
      }

      // 4e. 터미널 툴이 성공했으면 draft 확정 후 루프 종료.
      if (assembleHandled && finalDraft) {
        await patchAgentRun(runId, {
          output: finalDraft,
          status: "waiting_approval",
          tokensUsed: usage.tokensUsed,
          costUsdMicros: usage.costUsdMicros,
        });
        await appendAgentStep(runId, {
          stepType: "draft",
          title: "시험 draft 완성",
          content: `"${finalDraft.title}" 시험 draft 를 ${finalDraft.questions.length}개 문제로 조립했습니다. 강사 승인을 기다립니다.`,
          metadata: { draft: finalDraft },
        });
        break;
      }
    }

    // ── 5. draft 없이 루프 종료 → 실패 ──────────────────────
    if (!finalDraft) {
      await patchAgentRun(runId, {
        status: "failed",
        error: "에이전트가 시험 draft 를 완성하지 못했습니다. 다시 시도해 주세요.",
        tokensUsed: usage.tokensUsed,
        costUsdMicros: usage.costUsdMicros,
      });
    }
  } catch (error) {
    // ── 6. 에이전트 수준 오류 → status=failed, throw 하지 않음 ──
    const message =
      error instanceof Error ? error.message : "알 수 없는 에이전트 오류";
    logError("runAgentTurn failed", error, {
      path: AGENT_ROUTE,
      additionalData: { runId },
    });
    try {
      await patchAgentRun(runId, {
        status: "failed",
        error: message,
        tokensUsed: usage.tokensUsed,
        costUsdMicros: usage.costUsdMicros,
      });
    } catch (patchError) {
      logError("runAgentTurn: failed to record failure", patchError, {
        path: AGENT_ROUTE,
        additionalData: { runId },
      });
    }
  }

  // ── 7. 최신 record 반환 ────────────────────────────────────
  const finalRecord = await getAgentRun(runId);
  if (!finalRecord) {
    throw new Error(`runAgentTurn: agent_run disappeared: ${runId}`);
  }
  return finalRecord;
}
