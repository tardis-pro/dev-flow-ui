"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArtifactsViewer } from "@/components/ArtifactsViewer";
import { DiffViewer } from "@/components/DiffViewer";
import { PRPanel } from "@/components/PRPanel";
import { ChecksPanel } from "@/components/ChecksPanel";
import { useBoardStore } from "@/lib/stores/board-store";
import { WORK_TYPE_LABELS, nextStatus } from "@/lib/labels";
import { toast } from "sonner";

type IssueDrawerProps = {
  owner: string;
  repo: string;
};

type LoadingState = {
  artifacts: boolean;
  diff: boolean;
  pr: boolean;
  checks: boolean;
};

export function IssueDrawer({ owner, repo }: IssueDrawerProps) {
  const {
    selectedIssue,
    drawerData,
    resetDrawer,
    hydrateDrawer,
    moveIssueOptimistic,
    revertIssueMove,
  } = useBoardStore();
  const [tab, setTab] = useState("artifacts");
  const [loading, setLoading] = useState<LoadingState>({
    artifacts: false,
    diff: false,
    pr: false,
    checks: false,
  });

  const isOpen = Boolean(selectedIssue);

  useEffect(() => {
    if (!selectedIssue) return;

    if (!drawerData?.artifacts && !loading.artifacts) {
      void loadArtifacts();
    }
    if (!drawerData?.compare && !loading.diff) {
      void loadDiff();
    }
    if (!drawerData?.compare && !drawerData?.artifacts) {
      setTab("artifacts");
    }
    if (!drawerData?.issue?.linkedPullRequest && !loading.pr) {
      void loadPullRequest();
    }
    const pullNumber = drawerData?.issue?.linkedPullRequest?.number;
    if (pullNumber && !drawerData.checks && !loading.checks) {
      void loadChecks(pullNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssue, drawerData?.issue?.linkedPullRequest?.number]);

  useEffect(() => {
    if (!selectedIssue) {
      setTab("artifacts");
      setLoading({
        artifacts: false,
        diff: false,
        pr: false,
        checks: false,
      });
    }
  }, [selectedIssue]);

  async function loadArtifacts() {
    if (!selectedIssue) return;
    setLoading((state) => ({ ...state, artifacts: true }));
    try {
      const response = await fetch(
        `/api/artifacts/${selectedIssue.number}?owner=${owner}&repo=${repo}`,
      );
      const data = await response.json();
      hydrateDrawer({ artifacts: data.artifacts });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load artifacts for this issue.");
    } finally {
      setLoading((state) => ({ ...state, artifacts: false }));
    }
  }

  async function loadDiff() {
    if (!selectedIssue) return;
    setLoading((state) => ({ ...state, diff: true }));
    try {
      const workType = selectedIssue.workTypes?.[0] ?? "";
      const response = await fetch(
        `/api/diff/${selectedIssue.number}?owner=${owner}&repo=${repo}&workType=${workType}`,
      );
      const data = await response.json();
      hydrateDrawer({ compare: data.compare, branch: data.branch });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load diff from GitHub.");
    } finally {
      setLoading((state) => ({ ...state, diff: false }));
    }
  }

  async function loadPullRequest() {
    if (!selectedIssue) return;
    setLoading((state) => ({ ...state, pr: true }));
    try {
      const response = await fetch(
        `/api/pr/by-issue/${selectedIssue.number}?owner=${owner}&repo=${repo}`,
      );
      const data = await response.json();
      if (data.pullRequest) {
        hydrateDrawer({
          issue: {
            ...selectedIssue,
            linkedPullRequest: data.pullRequest,
          },
        });
        await loadChecks(data.pullRequest.number);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to resolve pull request.");
    } finally {
      setLoading((state) => ({ ...state, pr: false }));
    }
  }

  async function loadChecks(pullNumber: number) {
    setLoading((state) => ({ ...state, checks: true }));
    try {
      const response = await fetch(
        `/api/checks/${pullNumber}?owner=${owner}&repo=${repo}`,
      );
      const data = await response.json();
      hydrateDrawer({ checks: data.runs });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load workflow runs.");
    } finally {
      setLoading((state) => ({ ...state, checks: false }));
    }
  }

  async function runOrchestrator() {
    if (!selectedIssue) return;
    try {
      const workType = selectedIssue.workTypes?.[0];
      const response = await fetch(`/api/orchestrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueNumber: selectedIssue.number,
          status: selectedIssue.status,
          workType,
          owner,
          repo,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast.success("Gemini orchestration dispatched.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to run orchestrator.");
    }
  }

  async function openPullRequest() {
    if (!selectedIssue) return;
    try {
      const response = await fetch(`/api/pr/${selectedIssue.number}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast.success("Pull request opened or updated.");
      await loadPullRequest();
    } catch (error) {
      console.error(error);
      toast.error("Failed to open or update pull request.");
    }
  }

  async function moveToNextStage() {
    if (!selectedIssue) return;
    const currentStatus = selectedIssue.status;
    const next = nextStatus(currentStatus);
    if (next === currentStatus) {
      toast.info("Issue already in the final stage.");
      return;
    }

    const moved = moveIssueOptimistic(selectedIssue.number, next);
    hydrateDrawer({ issue: { ...selectedIssue, status: next } });
    try {
      const response = await fetch(`/api/issues/${selectedIssue.number}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: next,
          owner,
          repo,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast.success(`Issue moved to ${next}.`);
    } catch (error) {
      console.error(error);
      if (moved) {
        revertIssueMove(selectedIssue.number, currentStatus);
      }
      hydrateDrawer({ issue: { ...selectedIssue, status: currentStatus } });
      toast.error("Failed to move issue to the next stage.");
    }
  }

  const workTypeLabel = useMemo(() => {
    const current = selectedIssue?.workTypes?.[0];
    if (!current) return null;
    if (WORK_TYPE_LABELS.includes(current)) {
      return current;
    }
    return null;
  }, [selectedIssue]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && resetDrawer()}>
      <SheetContent className="w-full sm:max-w-2xl bg-slate-900/95 backdrop-blur-2xl border-slate-700/50 shadow-2xl shadow-black/50">
        {/* Animated gradient border effect */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-pink-500/10 to-purple-500/10 opacity-30 animate-pulse" />
        </div>

        {selectedIssue ? (
          <div className="relative flex h-full flex-col gap-6 overflow-hidden">
            {/* Header with glassmorphic card */}
            <div className="relative flex-shrink-0 rounded-2xl border border-slate-700/50 bg-white/5 backdrop-blur-sm p-5 shadow-lg">
              <SheetHeader>
                <SheetTitle className="flex flex-col gap-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 bg-slate-800/50 rounded-full border border-slate-700/50">
                      Issue #{selectedIssue.number}
                    </span>
                    {/* Neon accent indicator */}
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-cyan-500/50 via-transparent to-transparent" />
                  </div>
                  <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    {selectedIssue.title}
                  </span>
                </SheetTitle>
                {selectedIssue.body && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {selectedIssue.body}
                    </p>
                  </div>
                )}
                <SheetDescription className="flex flex-wrap items-center gap-2 text-left mt-3">
                  <Badge
                    variant="outline"
                    className="border-cyan-500/50 text-cyan-300 bg-cyan-500/10 font-mono text-xs uppercase"
                  >
                    {selectedIssue.status}
                  </Badge>
                  {workTypeLabel ? (
                    <Badge
                      variant="success"
                      className="capitalize border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-semibold"
                    >
                      {workTypeLabel}
                    </Badge>
                  ) : null}
                  {selectedIssue.labels
                    .filter((label) => label.name && !label.name.startsWith("status:"))
                    .map((label) => (
                      <Badge
                        key={label.name}
                        variant="outline"
                        className="border-slate-600 bg-slate-800/50 text-slate-300"
                      >
                        {label.name}
                      </Badge>
                    ))}
                </SheetDescription>
              </SheetHeader>
            </div>

            {/* Tabs with neon styling */}
            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="flex-shrink-0 w-full justify-start bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 p-1">
                <TabsTrigger
                  value="artifacts"
                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-b-2 data-[state=active]:border-cyan-400 transition-all"
                >
                  Artifacts
                </TabsTrigger>
                <TabsTrigger
                  value="diff"
                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-b-2 data-[state=active]:border-cyan-400 transition-all"
                >
                  Diff
                </TabsTrigger>
                <TabsTrigger
                  value="pr"
                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-b-2 data-[state=active]:border-cyan-400 transition-all"
                >
                  PR
                </TabsTrigger>
                <TabsTrigger
                  value="checks"
                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-b-2 data-[state=active]:border-cyan-400 transition-all"
                >
                  Checks
                </TabsTrigger>
              </TabsList>
              <TabsContent value="artifacts" className="flex-1 mt-4 overflow-y-auto">
                <ArtifactsViewer
                  artifacts={drawerData?.artifacts}
                  isLoading={loading.artifacts}
                />
              </TabsContent>
              <TabsContent value="diff" className="flex-1 mt-4 overflow-y-auto">
                <DiffViewer
                  compare={drawerData?.compare}
                  branch={drawerData?.branch}
                  isLoading={loading.diff}
                />
              </TabsContent>
              <TabsContent value="pr" className="flex-1 mt-4 overflow-y-auto">
                <PRPanel
                  pullRequest={drawerData?.issue?.linkedPullRequest}
                  isLoading={loading.pr}
                  onRefresh={loadPullRequest}
                />
              </TabsContent>
              <TabsContent value="checks" className="flex-1 mt-4 overflow-y-auto">
                <ChecksPanel runs={drawerData?.checks} isLoading={loading.checks} />
              </TabsContent>
            </Tabs>

            <Separator className="flex-shrink-0 bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

            {/* Action buttons with glassmorphic styling */}
            <div className="relative flex-shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-2xl border border-slate-700/50 bg-white/5 backdrop-blur-sm">
              <Button
                onClick={runOrchestrator}
                variant="default"
                className="relative overflow-hidden bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border-0 shadow-lg shadow-cyan-500/20 transition-all duration-300"
              >
                <span className="relative z-10">Run Gemini (Stage-aware)</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
              <Button
                onClick={openPullRequest}
                variant="secondary"
                className="border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 hover:border-pink-500/50 shadow-md transition-all duration-300"
              >
                Open / Update PR
              </Button>
              <Button
                onClick={moveToNextStage}
                variant="outline"
                className="border-slate-600 hover:border-purple-500/50 hover:bg-purple-500/10 hover:text-purple-300 transition-all duration-300"
              >
                Move to Next Stage
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
