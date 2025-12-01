"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Play, Pause } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
// ScrollArea will be replaced with div for now
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

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

interface LiveMonitoringCardProps {
  examId: string;
}

export function LiveMonitoringCard({ examId }: LiveMonitoringCardProps) {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(() => {
    // 페이지를 나갔다 돌아왔을 때를 위해 localStorage에서 복원
    if (typeof window !== "undefined") {
      return localStorage.getItem(`live_monitoring_last_fetch_${examId}`);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLiveMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = `/api/exam/${examId}/live-messages${
        lastFetchTime ? `?since=${lastFetchTime}` : ""
      }`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch live messages");
      }

      const data = await response.json();
      const newMessages = data.messages || [];

      if (newMessages.length > 0) {
        // Add new messages to the list (avoid duplicates)
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const uniqueNewMessages = newMessages.filter(
            (m: LiveMessage) => !existingIds.has(m.id)
          );
          return [...uniqueNewMessages, ...prev].slice(0, 100); // Keep only latest 100
        });

        // Scroll to top when new messages arrive
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      }

      // Update last fetch time
      const newTimestamp = data.timestamp || new Date().toISOString();
      setLastFetchTime(newTimestamp);
      // localStorage에 저장하여 페이지를 나갔다 돌아와도 유지
      if (typeof window !== "undefined") {
        localStorage.setItem(`live_monitoring_last_fetch_${examId}`, newTimestamp);
      }
    } catch (error) {
      console.error("Error fetching live messages:", error);
    } finally {
      setIsLoading(false);
    }
  }, [examId, lastFetchTime]);

  // Page Visibility API: 탭이 비활성화되면 polling 일시 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      
      // 페이지가 다시 보이면 즉시 최신 메시지 가져오기
      if (visible && isMonitoring) {
        fetchLiveMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    setIsPageVisible(!document.hidden);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMonitoring, fetchLiveMessages]);

  // Initial fetch and polling
  useEffect(() => {
    if (!isMonitoring || !isPageVisible) return;

    // Initial fetch (페이지가 보일 때)
    fetchLiveMessages();

    // Polling: Fetch every 3 seconds when monitoring is active and page is visible
    const interval = setInterval(() => {
      if (isPageVisible) {
        fetchLiveMessages();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [isMonitoring, examId, isPageVisible, fetchLiveMessages]);

  const handleToggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
  };

  const handleRefresh = () => {
    setLastFetchTime(null);
    setMessages([]);
    fetchLiveMessages();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              실시간 모니터링
            </CardTitle>
            <CardDescription>
              학생들의 실시간 질문 및 활동 모니터링
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isMonitoring && isPageVisible ? "default" : "secondary"}
              className={
                isMonitoring && isPageVisible
                  ? "bg-green-500 text-white animate-pulse"
                  : isMonitoring && !isPageVisible
                  ? "bg-yellow-500 text-white"
                  : "bg-gray-500"
              }
            >
              {isMonitoring
                ? isPageVisible
                  ? "활성"
                  : "백그라운드"
                : "중지됨"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleMonitoring}
              disabled={isLoading}
            >
              {isMonitoring ? (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  중지
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  시작
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[600px] overflow-y-auto pr-2" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>아직 질문이 없습니다.</p>
              <p className="text-sm mt-2">
                학생들이 질문하면 여기에 실시간으로 표시됩니다.
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
                        <h4 className="font-medium text-sm">
                          {message.student.name}
                        </h4>
                        {message.student.student_number && (
                          <span className="text-xs text-muted-foreground">
                            ({message.student.student_number})
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          문제 {message.q_idx + 1}
                        </Badge>
                      </div>
                      {message.student.school && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {message.student.school}
                        </p>
                      )}
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
      </CardContent>
    </Card>
  );
}
