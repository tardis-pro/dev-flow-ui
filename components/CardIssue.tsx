"use client";

import type { IssueSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatRelativeTime } from "@/lib/utils";
import { GitPullRequest, User } from "lucide-react";
import { AvatarImage } from "@radix-ui/react-avatar";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { memo } from "react";

type CardIssueProps = {
  issue: IssueSummary;
  onSelect?: (issue: IssueSummary) => void;
};

const Avatar = AvatarPrimitive.Root;

function IssueBadge({ label }: { label: string }) {
  const variant =
    label === "feature"
      ? "success"
      : label === "bugfix"
      ? "destructive"
      : label === "performance"
      ? "info"
      : "outline";
  return (
    <Badge key={label} variant={variant} className="capitalize">
      {label.replace("status:", "")}
    </Badge>
  );
}

export const CardIssue = memo(function CardIssue({
  issue,
  onSelect,
}: CardIssueProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(issue)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(issue);
        }
      }}
      className={cn(
        "group relative overflow-hidden flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-sm p-4 text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/70 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
      )}
    >
      {/* Neon glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-pink-500/5 to-purple-500/5" />
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-pink-500/20 to-purple-500/20 blur-xl" />
      </div>

      {/* Top border accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5 bg-slate-800/50 rounded-full border border-slate-700/50 font-mono">
              #{issue.number}
            </span>
            {/* Subtle neon accent line */}
            <div className="flex-1 h-[1px] w-8 bg-gradient-to-r from-cyan-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
            {issue.title}
          </h3>
        </div>
        {issue.linkedPullRequest ? (
          <span
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 shadow-md transition-all duration-300",
              "group-hover:border-pink-500/50 group-hover:bg-pink-500/10 group-hover:text-pink-400 group-hover:shadow-pink-500/20",
            )}
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            PR #{issue.linkedPullRequest.number}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-wrap gap-2">
        {issue.workTypes.map((label) => (
          <IssueBadge key={label} label={label} />
        ))}
        {issue.labels
          .filter((label) => label.name && !label.name.startsWith("status:"))
          .map((label) => (
            <Badge
              key={label.name}
              variant="outline"
              className="border-slate-700/50 bg-slate-800/50 text-slate-300 hover:border-slate-600 transition-colors"
            >
              {label.name}
            </Badge>
          ))}
      </div>

      <div className="relative flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          {issue.assignees.length ? (
            <div className="flex -space-x-2">
              {issue.assignees.map((assignee) => (
                <Avatar
                  key={assignee.login}
                  className="h-7 w-7 rounded-full border-2 border-slate-900 bg-slate-800 ring-2 ring-slate-800 group-hover:ring-cyan-500/30 transition-all duration-300"
                >
                  <AvatarImage
                    src={assignee.avatarUrl}
                    alt={assignee.login}
                    className="h-full w-full rounded-full object-cover"
                  />
                </Avatar>
              ))}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-700 bg-slate-800/30 px-2.5 py-1 text-[11px] text-slate-500 transition-all group-hover:border-slate-600 group-hover:text-slate-400">
              <User className="h-3 w-3" />
              Unassigned
            </div>
          )}
        </div>
        <span className="font-mono text-[10px] group-hover:text-slate-400 transition-colors">
          Updated {formatRelativeTime(issue.updatedAt)}
        </span>
      </div>

      {/* Bottom corner accent */}
      <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-tl-3xl" />
    </Card>
  );
});
