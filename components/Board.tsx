"use client";

import { useEffect } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Column } from "@/components/Column";
import { useBoardStore } from "@/lib/stores/board-store";
import type { IssueBoardColumn } from "@/lib/types";
import type { IssueStatus } from "@/lib/labels";
import { IssueDrawer } from "@/components/IssueDrawer";
import { ScrollArea } from "@/components/ui/scroll-area";

type BoardProps = {
  initialColumns: IssueBoardColumn[];
  owner: string;
  repo: string;
};

export function Board({ initialColumns, owner, repo }: BoardProps) {
  const {
    columns,
    setColumns,
    moveIssueOptimistic,
    revertIssueMove,
    selectIssue,
  } = useBoardStore();

  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns, setColumns]);

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
            {columns.map((column) => (
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
