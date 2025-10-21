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
import { ISSUE_STATUSES, WORK_TYPE_LABELS, nextStatus, type IssueStatus } from "@/lib/labels";
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
      <SheetContent>
        {selectedIssue ? (
          <div className="flex h-full flex-col gap-6">
            <SheetHeader>
              <SheetTitle className="flex flex-col gap-2 text-left">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Issue #{selectedIssue.number}
                </span>
                {selectedIssue.title}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 text-left">
                <Badge variant="outline">{selectedIssue.status}</Badge>
                {workTypeLabel ? (
                  <Badge variant="success" className="capitalize">
                    {workTypeLabel}
                  </Badge>
                ) : null}
                {selectedIssue.labels
                  .filter((label) => label.name && !label.name.startsWith("status:"))
                  .map((label) => (
                    <Badge key={label.name} variant="outline">
                      {label.name}
                    </Badge>
                  ))}
              </SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
                <TabsTrigger value="diff">Diff</TabsTrigger>
                <TabsTrigger value="pr">PR</TabsTrigger>
                <TabsTrigger value="checks">Checks</TabsTrigger>
              </TabsList>
              <TabsContent value="artifacts">
                <ArtifactsViewer
                  artifacts={drawerData?.artifacts}
                  isLoading={loading.artifacts}
                />
              </TabsContent>
              <TabsContent value="diff">
                <DiffViewer
                  compare={drawerData?.compare}
                  branch={drawerData?.branch}
                  isLoading={loading.diff}
                />
              </TabsContent>
              <TabsContent value="pr">
                <PRPanel
                  pullRequest={drawerData?.issue?.linkedPullRequest}
                  isLoading={loading.pr}
                  onRefresh={loadPullRequest}
                />
              </TabsContent>
              <TabsContent value="checks">
                <ChecksPanel runs={drawerData?.checks} isLoading={loading.checks} />
              </TabsContent>
            </Tabs>

            <Separator className="border-slate-800" />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runOrchestrator} variant="default">
                Run Gemini (Stage-aware)
              </Button>
              <Button onClick={openPullRequest} variant="secondary">
                Open / Update PR
              </Button>
              <Button onClick={moveToNextStage} variant="outline">
                Move to Next Stage
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
