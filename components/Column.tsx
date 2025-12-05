"use client";

import type { IssueBoardColumn, IssueSummary } from "@/lib/types";
import type { IssueStatus } from "@/lib/labels";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { memo, useState, useMemo } from "react";
import { CardIssue } from "@/components/CardIssue";
import { ArrowDownUp } from "lucide-react";

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

type SortOption = "newest" | "oldest" | "number-asc" | "number-desc" | "title";

export const Column = memo(function ColumnComponent({
  column,
  onSelectIssue,
}: ColumnProps) {
  const [sortBy, setSortBy] = useState<SortOption>("newest");

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

  const sortedIssues = useMemo(() => {
    const issues = [...column.issues];

    switch (sortBy) {
      case "newest":
        return issues.sort((a, b) => b.number - a.number);
      case "oldest":
        return issues.sort((a, b) => a.number - b.number);
      case "number-asc":
        return issues.sort((a, b) => a.number - b.number);
      case "number-desc":
        return issues.sort((a, b) => b.number - a.number);
      case "title":
        return issues.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return issues;
    }
  }, [column.issues, sortBy]);

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
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              >
                <ArrowDownUp className="h-3 w-3" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSortBy("newest")}>
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("oldest")}>
                Oldest First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("number-asc")}>
                Issue # (Low to High)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("number-desc")}>
                Issue # (High to Low)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("title")}>
                Title (A-Z)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Badge variant="outline">{column.status}</Badge>
        </div>
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
            {sortedIssues.map((issue, index) => (
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
