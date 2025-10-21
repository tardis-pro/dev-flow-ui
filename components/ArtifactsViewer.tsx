"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArtifactFile } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import type { HTMLAttributes } from "react";

const markdownComponents: Components = {
  h1: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-2xl font-semibold text-slate-100" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mt-6 text-xl font-semibold text-slate-100" {...props}>
      {children}
    </h2>
  ),
  pre: ({ children, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="mt-4 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-100"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm" {...props}>
      {children}
    </code>
  ),
};

type ArtifactsViewerProps = {
  artifacts?: ArtifactFile[];
  isLoading?: boolean;
};

export function ArtifactsViewer({ artifacts, isLoading }: ArtifactsViewerProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!artifacts?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-800/80 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        <p>No artifacts found for this issue.</p>
        <p className="text-xs text-slate-500">
          Once Gemini or the orchestrator runs, outputs will appear automatically.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[70vh] pr-4">
      <div className="space-y-6">
        {artifacts.map((artifact) => (
          <Card key={artifact.path} className="border-slate-800 bg-slate-950/70">
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle className="text-base text-slate-100">
                {artifact.name}
              </CardTitle>
              <Badge variant="outline" className="text-xs font-medium uppercase">
                {artifact.path}
              </Badge>
            </CardHeader>
            <CardContent className="prose max-w-none prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                components={markdownComponents}
              >
                {artifact.content}
              </ReactMarkdown>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
