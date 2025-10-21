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
        "group flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 text-left shadow-md transition hover:-translate-y-0.5 hover:border-sky-500/70 hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-slate-500">
            #{issue.number}
          </span>
          <h3 className="text-sm font-semibold text-slate-100">
            {issue.title}
          </h3>
        </div>
        {issue.linkedPullRequest ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400",
            )}
          >
            <GitPullRequest className="h-3 w-3" />
            PR #{issue.linkedPullRequest.number}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {issue.workTypes.map((label) => (
          <IssueBadge key={label} label={label} />
        ))}
        {issue.labels
          .filter((label) => label.name && !label.name.startsWith("status:"))
          .map((label) => (
            <Badge key={label.name} variant="outline">
              {label.name}
            </Badge>
          ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          {issue.assignees.length ? (
            <div className="flex -space-x-2">
              {issue.assignees.map((assignee) => (
                <Avatar
                  key={assignee.login}
                  className="h-7 w-7 rounded-full border-2 border-slate-950 bg-slate-800"
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
            <div className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-700 px-2 py-1 text-[11px] text-slate-500">
              <User className="h-3 w-3" />
              Unassigned
            </div>
          )}
        </div>
        <span>Updated {formatRelativeTime(issue.updatedAt)}</span>
      </div>
    </Card>
  );
});
