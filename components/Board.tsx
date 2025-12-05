"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Column } from "@/components/Column";
import { useBoardStore } from "@/lib/stores/board-store";
import type { IssueBoardColumn, IssueSummary } from "@/lib/types";
import type { IssueStatus, WorkType } from "@/lib/labels";
import { IssueDrawer } from "@/components/IssueDrawer";
import { ScrollArea } from "@/components/ui/scroll-area";

type BoardProps = {
  initialColumns: IssueBoardColumn[];
  owner: string;
  repo: string;
  initialIssueNumber?: number;
};

export function Board({ initialColumns, owner, repo, initialIssueNumber }: BoardProps) {
  const {
    columns,
    setColumns,
    moveIssueOptimistic,
    revertIssueMove,
    selectIssue,
    resetDrawer,
  } = useBoardStore();
  const params = useSearchParams();

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns, setColumns]);

  // Apply client-side filtering
  const filteredColumns = useMemo(() => {
    const statusFilter = params?.get("status")?.split(",") as IssueStatus[] | undefined;
    const workTypeFilter = params?.get("workType")?.split(",") as WorkType[] | undefined;
    const assigneeFilter = params?.get("assignee");

    if (!statusFilter && !workTypeFilter && !assigneeFilter) {
      return columns.length ? columns : initialColumns;
    }

    const allColumns = columns.length ? columns : initialColumns;

    return allColumns.map((column) => {
      let filteredIssues = column.issues;

      // Filter by status (only show issues in selected statuses)
      if (statusFilter && statusFilter.length > 0) {
        if (!statusFilter.includes(column.status)) {
          return { ...column, issues: [] };
        }
      }

      // Filter by work type
      if (workTypeFilter && workTypeFilter.length > 0) {
        filteredIssues = filteredIssues.filter((issue) =>
          issue.workTypes.some((wt) => workTypeFilter.includes(wt))
        );
      }

      // Filter by assignee
      if (assigneeFilter) {
        filteredIssues = filteredIssues.filter((issue) =>
          issue.assignees.some((a) => a.login === assigneeFilter)
        );
      }

      return { ...column, issues: filteredIssues };
    });
  }, [columns, initialColumns, params]);

  useEffect(() => {
    resetDrawer();
  }, [owner, repo, resetDrawer]);

  useEffect(() => {
    if (!initialIssueNumber) return;
    const issue = initialColumns
      .flatMap((column) => column.issues)
      .find((item) => item.number === initialIssueNumber);
    if (issue) {
      selectIssue(issue);
    }
  }, [initialIssueNumber, initialColumns, selectIssue]);

  async function handleDrop(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const issueNumber = Number.parseInt(draggableId.replace("issue-", ""), 10);
    if (!Number.isInteger(issueNumber)) return;

    const targetStatus = destination.droppableId as IssueStatus;
    const originalStatus = source.droppableId as IssueStatus;

    const movedIssue = moveIssueOptimistic(issueNumber, targetStatus);
    if (!movedIssue) return;

    try {
      const response = await fetch(`/api/issues/${issueNumber}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: targetStatus,
          owner,
          repo,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast.success(
        `Moved #${issueNumber} to ${targetStatus.toUpperCase()}. Workflow dispatched.`,
      );
    } catch (error) {
      revertIssueMove(issueNumber, originalStatus);
      toast.error(`Failed to move #${issueNumber}. ${String(error)}`);
    }
  }

  return (
    <>
      <ScrollArea className="w-full flex-1">
        <DragDropContext onDragEnd={handleDrop}>
          <div className="flex min-h-[420px] gap-6 pb-6">
            {filteredColumns.map((column) => (
              <Column
                key={column.status}
                column={column}
                onSelectIssue={selectIssue}
              />
            ))}
          </div>
        </DragDropContext>
      </ScrollArea>
      <IssueDrawer owner={owner} repo={repo} />
    </>
  );
}
