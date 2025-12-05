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
    return (
      <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-sm p-6">
        <Skeleton className="h-48 w-full bg-slate-800/50" />
      </div>
    );
  }

  if (!pullRequest) {
    return (
      <div className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-700/50 bg-slate-900/40 backdrop-blur-sm p-10 text-center overflow-hidden">
        {/* Subtle animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800/20 via-transparent to-purple-900/10 opacity-50" />

        <div className="relative z-10 flex flex-col items-center gap-3">
          <GitPullRequest className="h-12 w-12 text-slate-700" />
          <p className="text-sm text-slate-400 font-medium">No pull request linked yet.</p>
          <p className="text-xs text-slate-500 max-w-xs">
            Use &ldquo;Open/Update PR&rdquo; below to spin one up from the nav branch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 rounded-2xl border border-slate-700/50 bg-slate-950/70 backdrop-blur-sm p-6 shadow-xl overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-pink-500/5 opacity-50" />

      {/* Top neon accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500/50 via-pink-500/50 to-purple-500/50" />

      {/* Header */}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 text-xs uppercase border-cyan-500/50 bg-cyan-500/10 text-cyan-300 font-mono font-bold"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              PR #{pullRequest.number}
            </Badge>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-cyan-500/30 to-transparent" />
          </div>
          <span className="text-sm font-semibold text-slate-200">{pullRequest.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pullRequest.ciStatus ? (
            <Badge
              variant="outline"
              className={
                pullRequest.ciStatus === "success"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-semibold"
                  : pullRequest.ciStatus === "failure"
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-300 font-semibold"
                  : "border-amber-500/50 bg-amber-500/10 text-amber-300 font-semibold"
              }
            >
              CI: {pullRequest.ciStatus}
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className="text-xs uppercase border-purple-500/50 bg-purple-500/10 text-purple-300 font-mono font-bold"
          >
            {pullRequest.mergeable}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="relative space-y-4 text-sm text-slate-300">
        {/* Reviewers */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reviewers</span>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-slate-700 to-transparent" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pullRequest.reviewers.map((reviewer) => (
              <Badge
                key={reviewer.login}
                variant="outline"
                className="gap-2 text-xs border-slate-700/50 bg-slate-800/50 hover:border-slate-600 transition-colors"
              >
                <span className="font-semibold text-slate-200">{reviewer.login}</span>
                <span className="text-slate-400 text-[10px]">{reviewer.state.toLowerCase()}</span>
              </Badge>
            ))}
            {!pullRequest.reviewers.length ? (
              <span className="text-xs text-slate-500 italic">No reviews yet.</span>
            ) : null}
          </div>
        </div>

        {/* Gemini Summary */}
        {pullRequest.geminiSummary ? (
          <div className="relative rounded-xl border border-cyan-700/50 bg-gradient-to-br from-cyan-900/30 to-blue-900/30 backdrop-blur-sm p-4 shadow-lg">
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent animate-pulse" />
            <p className="relative text-sm text-cyan-100 leading-relaxed">
              {pullRequest.geminiSummary}
            </p>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="relative flex flex-wrap items-center gap-3 pt-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-slate-600 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all duration-300"
        >
          <a
            href={pullRequest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open PR
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="flex items-center gap-2 hover:bg-slate-800/50 hover:text-slate-300 transition-all"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </Button>
        {pullRequest.latestCommitSha ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
            <span className="text-[10px] uppercase font-mono text-slate-500">Head</span>
            <span className="text-xs font-mono text-pink-400">
              {pullRequest.latestCommitSha.substring(0, 7)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
