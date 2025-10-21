"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CompareSummary } from "@/lib/types";

type DiffViewerProps = {
  compare?: CompareSummary | null;
  branch?: string | null;
  isLoading?: boolean;
};

export function DiffViewer({ compare, branch, isLoading }: DiffViewerProps) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!compare || !branch) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-800/80 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        <p>No matching nav/* branch detected.</p>
        <p className="text-xs text-slate-500">
          Once the orchestrator creates a branch, the compare view will appear.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <Badge variant="outline" className="bg-slate-900">
          {compare.baseRef} → {compare.headRef}
        </Badge>
        <span className="text-xs text-slate-500">
          +{compare.aheadBy} / -{compare.behindBy}
        </span>
        {compare.permalinkUrl ? (
          <a
            href={compare.permalinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-sky-400 hover:text-sky-300"
          >
            Open on GitHub
          </a>
        ) : null}
      </div>

      <ScrollArea className="max-h-[70vh] pr-4">
        <div className="space-y-4">
          {compare.files.map((file) => (
            <Card key={file.filename} className="border-slate-800 bg-slate-950/70">
              <CardHeader className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-semibold text-slate-100">
                  {file.filename}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    file.status === "added" && "text-emerald-300 border-emerald-400/50",
                    file.status === "removed" && "text-rose-300 border-rose-400/50",
                  )}
                >
                  {file.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="text-emerald-400">+{file.additions}</span>
                  <span className="text-rose-400">-{file.deletions}</span>
                </div>
                {file.patch ? (
                  <pre className="mt-4 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                    {file.patch}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
