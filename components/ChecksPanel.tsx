"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkflowRunSummary } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

type ChecksPanelProps = {
  runs?: WorkflowRunSummary[];
  isLoading?: boolean;
};

export function ChecksPanel({ runs, isLoading }: ChecksPanelProps) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!runs?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-800/80 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        <p>No workflow runs detected.</p>
        <p className="text-xs text-slate-500">Trigger a run to see CI health here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.id} className="border-slate-800 bg-slate-950/70">
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle className="text-base text-slate-100">
              {run.name} · #{run.runNumber}
            </CardTitle>
            <Badge
              variant="outline"
              className={
                run.conclusion === "success"
                  ? "border-emerald-400/70 text-emerald-200"
                  : run.conclusion === "failure"
                  ? "border-rose-400/70 text-rose-200"
                  : "border-amber-400/70 text-amber-200"
              }
            >
              {run.conclusion ?? run.status}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>Event: {run.event}</span>
            <span>Updated {formatRelativeTime(run.updatedAt)}</span>
            {typeof run.durationMs === "number" ? (
              <span>
                Duration {(run.durationMs / 1000 / 60).toFixed(1)} min
              </span>
            ) : null}
            <a
              href={run.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sky-400 hover:text-sky-300"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View run
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
