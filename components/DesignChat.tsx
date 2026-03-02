"use client";

import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { User, Bot, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { IssueStatus } from "@/lib/labels";

interface CommentSummary {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  isDevFlow: boolean;
  phase?: string;
}

interface DesignChatProps {
  issueNumber: number;
  owner: string;
  repo: string;
  issueStatus: IssueStatus;
  initialComments?: CommentSummary[];
}

export function DesignChat({ issueNumber, owner, repo, issueStatus, initialComments }: DesignChatProps) {
  const [comments, setComments] = useState<CommentSummary[]>(initialComments || []);
  const [replyText, setReplyText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      scrollToBottom();
    }
  }, [initialComments]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSend = async () => {
    if (!replyText.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/conversation/${issueNumber}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, message: replyText }),
      });

      if (!response.ok) {
        throw new Error("Failed to send reply");
      }

      const data = await response.json();
      
      // Add user comment to local state
      setComments(prev => [
        ...prev,
        {
          id: data.userComment.id,
          author: "You",
          body: replyText,
          createdAt: new Date().toISOString(),
          isDevFlow: false,
        }
      ]);

      // Add AI comment to local state
      setComments(prev => [
        ...prev,
        {
          id: data.aiComment.id,
          author: "DevFlow AI",
          body: data.aiComment.content,
          createdAt: new Date().toISOString(),
          isDevFlow: true,
        }
      ]);

      setReplyText("");
      scrollToBottom();
    } catch (error) {
      console.error("Error sending reply:", error);
      // Show toast error (simplified - would use sonner in real app)
      console.log("Error sending reply");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with issue status */}
      <div className="flex-shrink-0 p-4 border-b border-slate-700/50">
        <Badge
          variant="outline"
          className="border-cyan-500/50 text-cyan-300 bg-cyan-500/10 font-mono text-xs uppercase"
        >
          {issueStatus}
        </Badge>
      </div>

      {/* Chat messages */}
      <ScrollArea className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              <p className="text-sm mb-2">Start the conversation</p>
              <p className="text-xs text-slate-500">Ask DevFlow AI about your design decisions</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className={`flex ${comment.isDevFlow ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    comment.isDevFlow
                      ? "bg-slate-800 text-slate-100"
                      : "bg-cyan-900/20 text-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {comment.isDevFlow ? (
                      <Bot className="w-4 h-4 text-slate-400" />
                    ) : (
                      <User className="w-4 h-4 text-cyan-300" />
                    )}
                    <span className="text-xs text-slate-400">
                      {comment.author}
                    </span>
                    <span className="text-xs text-slate-500 ml-auto">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {comment.body}
                    </ReactMarkdown>
                </div>
              </div>
            </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Reply input */}
      <div className="flex-shrink-0 p-4 border-t border-slate-700/50">
        <div className="flex gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !replyText.trim()}
            className="h-10 w-10 rounded-full"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}