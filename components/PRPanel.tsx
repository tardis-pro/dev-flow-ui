"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { PullRequestSummary } from "@/lib/types";
import { GitPullRequest, ExternalLink, RefreshCcw } from "lucide-react";

type PRPanelProps = {
  pullRequest?: PullRequestSummary | null;
  isLoading?: boolean;
  onRefresh?: () => void;
};

export function PRPanel({ pullRequest, isLoading, onRefresh }: PRPanelProps) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!pullRequest) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-800/80 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        <p>No pull request linked yet.</p>
        <p className="text-xs text-slate-500">
          Use "Open/Update PR" below to spin one up from the nav branch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="flex items-center gap-1 text-xs uppercase">
            <GitPullRequest className="h-3.5 w-3.5" />
            PR #{pullRequest.number}
          </Badge>
          <span className="text-sm text-sky-400">{pullRequest.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {pullRequest.ciStatus ? (
            <Badge
              variant="outline"
              className={
                pullRequest.ciStatus === "success"
                  ? "border-emerald-400/70 text-emerald-200"
                  : pullRequest.ciStatus === "failure"
                  ? "border-rose-400/70 text-rose-200"
                  : "border-amber-400/70 text-amber-200"
              }
            >
              CI: {pullRequest.ciStatus}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-xs uppercase text-slate-300">
            {pullRequest.mergeable}
          </Badge>
        </div>
      </div>

      <div className="space-y-3 text-sm text-slate-300">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase text-slate-500">Reviewers</span>
          {pullRequest.reviewers.map((reviewer) => (
            <Badge key={reviewer.login} variant="outline" className="gap-2 text-xs">
              <span className="font-medium text-slate-100">{reviewer.login}</span>
              <span className="text-slate-400">{reviewer.state.toLowerCase()}</span>
            </Badge>
          ))}
          {!pullRequest.reviewers.length ? (
            <span className="text-xs text-slate-500">No reviews yet.</span>
          ) : null}
        </div>
        {pullRequest.geminiSummary ? (
          <p className="rounded-2xl border border-sky-700/60 bg-sky-900/40 p-4 text-sm text-sky-100">
            {pullRequest.geminiSummary}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <a href={pullRequest.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
            <ExternalLink className="h-4 w-4" />
            Open PR
          </a>
        </Button>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
        {pullRequest.latestCommitSha ? (
          <span className="text-xs text-slate-500">
            Head {pullRequest.latestCommitSha.substring(0, 7)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
