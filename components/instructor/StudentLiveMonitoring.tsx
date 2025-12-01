"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { createSupabaseClient } from "@/lib/supabase-client";
import { decompressData } from "@/lib/compression";
import { RealtimeChannel } from "@supabase/supabase-js";

interface LiveMessage {
  id: string;
  session_id: string;
  q_idx: number;
  content: string;
  created_at: string;
  student: {
    id: string;
    name: string;
    email: string;
    student_number?: string;
    school?: string;
  };
}

interface StudentLiveMonitoringProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  studentName: string;
  studentNumber?: string;
  school?: string;
}

export function StudentLiveMonitoring({
  open,
  onOpenChange,
  sessionId,
  studentName,
  studentNumber,
  school,
}: StudentLiveMonitoringProps) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const messagesMapRef = useRef<Map<string, LiveMessage>>(new Map());

  // localStorage에서 메시지 복원
  const storageKey = `live_messages_${sessionId}`;

  // 초기 메시지 로드 및 localStorage에서 복원
  const loadInitialMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      // localStorage에서 이전 메시지 복원
      const savedMessages = localStorage.getItem(storageKey);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
          parsed.forEach((msg: LiveMessage) => {
            messagesMapRef.current.set(msg.id, msg);
          });
        } catch (e) {
          console.error("Error parsing saved messages:", e);
        }
      }

      // API에서 최신 메시지 가져오기
      const response = await fetch(`/api/session/${sessionId}/live-messages`);
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        
        // 중복 제거하면서 추가
        newMessages.forEach((msg: LiveMessage) => {
          if (!messagesMapRef.current.has(msg.id)) {
            messagesMapRef.current.set(msg.id, msg);
          }
        });

        const allMessages = Array.from(messagesMapRef.current.values())
          .sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          .slice(0, 100);

        setMessages(allMessages);
        
        // localStorage에 저장
        localStorage.setItem(storageKey, JSON.stringify(allMessages));
      }
    } catch (error) {
      console.error("Error loading initial messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, storageKey]);

  // Supabase Realtime 구독
  useEffect(() => {
    if (!open || !sessionId) return;

    loadInitialMessages();

    // Supabase 클라이언트 생성
    const supabase = createSupabaseClient();

    // messages 테이블에 대한 실시간 구독
    const channel = supabase
      .channel(`student-messages:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            session_id: string;
            q_idx: number;
            role: string;
            content: string;
            compressed_content?: string;
            created_at: string;
          };

          // user 메시지만 표시
          if (newMessage.role !== "user") return;

          // 이미 있는 메시지면 스킵
          if (messagesMapRef.current.has(newMessage.id)) return;

          // 압축된 내용이 있으면 압축 해제
          let content = newMessage.content;
          if (newMessage.compressed_content) {
            try {
              const decompressed = decompressData(newMessage.compressed_content);
              content = typeof decompressed === "string" ? decompressed : content;
            } catch (error) {
              console.error("Error decompressing message:", error);
            }
          }

          const liveMessage: LiveMessage = {
            id: newMessage.id,
            session_id: newMessage.session_id,
            q_idx: newMessage.q_idx,
            content: content.substring(0, 500),
            created_at: newMessage.created_at,
            student: {
              id: sessionId,
              name: studentName,
              email: "",
              student_number: studentNumber,
              school: school,
            },
          };

          // 메시지 추가
          messagesMapRef.current.set(liveMessage.id, liveMessage);
          
          setMessages((prev) => {
            const updated = [liveMessage, ...prev]
              .filter((msg, index, self) => 
                index === self.findIndex((m) => m.id === msg.id)
              )
              .slice(0, 100);
            
            // localStorage에 저장
            localStorage.setItem(storageKey, JSON.stringify(updated));
            
            return updated;
          });

          // 스크롤을 맨 위로
          if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    subscriptionRef.current = channel;

    return () => {
      // 구독 해제
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [open, sessionId, studentName, studentNumber, school, storageKey, loadInitialMessages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {studentName} 학생 실시간 모니터링
          </DialogTitle>
          <DialogDescription>
            {studentNumber && `학번: ${studentNumber}`}
            {school && ` | 학교: ${school}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div
            className="h-[600px] overflow-y-auto pr-2"
            ref={scrollRef}
          >
            {isLoading && messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
                <p>메시지를 불러오는 중...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>아직 질문이 없습니다.</p>
                <p className="text-sm mt-2">
                  학생이 질문하면 여기에 실시간으로 표시됩니다.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            문제 {message.q_idx + 1}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatDistanceToNow(new Date(message.created_at), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                    </div>
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                        {message.content.length >= 500 && "..."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
