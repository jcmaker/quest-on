import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import AIMessageRenderer from "@/components/chat/AIMessageRenderer";

interface Conversation {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}

interface AIConversationsCardProps {
  messages: Conversation[];
}

export function AIConversationsCard({
  messages,
}: AIConversationsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          AI와의 대화 기록
        </CardTitle>
        <CardDescription>학생이 AI와 나눈 대화 내용입니다</CardDescription>
      </CardHeader>
      <CardContent>
        {messages.length > 0 ? (
          <div className="space-y-4 sm:space-y-6 max-h-96 overflow-y-auto p-2 sm:p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {message.role === "user" ? (
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 sm:px-5 py-3 sm:py-3.5 max-w-[85%] sm:max-w-[70%] shadow-lg shadow-primary/20 relative transition-all duration-200 hover:shadow-xl hover:shadow-primary/30">
                    <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <p className="text-xs mt-2 sm:mt-2.5 opacity-80 text-right font-medium">
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ) : (
                  <AIMessageRenderer
                    content={message.content}
                    timestamp={message.created_at}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>AI와의 대화 기록이 없습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

