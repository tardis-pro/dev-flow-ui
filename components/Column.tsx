"use client";

import type { IssueBoardColumn, IssueSummary } from "@/lib/types";
import type { IssueStatus } from "@/lib/labels";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { memo } from "react";
import { CardIssue } from "@/components/CardIssue";

const statusCopy: Record<IssueStatus, string> = {
  inception: "Inception",
  discussion: "Discussion",
  build: "Build",
  review: "Review",
  done: "Done",
};

type ColumnProps = {
  column: IssueBoardColumn;
  onSelectIssue?: (issue: IssueSummary) => void;
};

export const Column = memo(function ColumnComponent({
  column,
  onSelectIssue,
}: ColumnProps) {
  const accent =
    column.status === "inception"
      ? "from-slate-900/80 to-slate-950/80"
      : column.status === "discussion"
      ? "from-sky-500/10 to-sky-900/10"
      : column.status === "build"
      ? "from-amber-500/10 to-amber-900/10"
      : column.status === "review"
      ? "from-rose-500/10 to-rose-900/10"
      : "from-emerald-500/10 to-emerald-900/10";

  return (
    <div className="flex w-full min-w-[280px] max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            {statusCopy[column.status]}
          </h2>
          <p className="text-xs text-slate-500">
            {column.issues.length} issue{column.issues.length === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant="outline">{column.status}</Badge>
      </div>
      <Droppable droppableId={column.status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex flex-1 flex-col gap-3 rounded-3xl border border-dashed border-slate-800/70 bg-gradient-to-br p-3 transition",
              accent,
              snapshot.isDraggingOver && "border-sky-500/60 bg-sky-500/10",
            )}
          >
            {column.issues.map((issue, index) => (
              <Draggable
                key={issue.id}
                draggableId={`issue-${issue.number}`}
                index={index}
              >
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={cn(
                      "transition-transform",
                      dragSnapshot.isDragging && "scale-[1.01]",
                    )}
                  >
                    <CardIssue issue={issue} onSelect={onSelectIssue} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
});
