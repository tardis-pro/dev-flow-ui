"use client";

import { create } from "zustand";
import type { IssueBoardColumn, IssueSummary, ArtifactFile, CompareSummary, WorkflowRunSummary } from "@/lib/types";
import type { IssueStatus } from "@/lib/labels";

type DrawerData = {
  issue?: IssueSummary;
  artifacts?: ArtifactFile[];
  compare?: CompareSummary | null;
  branch?: string | null;
  checks?: WorkflowRunSummary[];
};

type BoardState = {
  columns: IssueBoardColumn[];
  isLoading: boolean;
  selectedIssue?: IssueSummary;
  drawerData?: DrawerData;
  setColumns: (columns: IssueBoardColumn[]) => void;
  moveIssueOptimistic: (issueNumber: number, toStatus: IssueStatus) => IssueSummary | undefined;
  revertIssueMove: (issueNumber: number, originalStatus: IssueStatus) => void;
  setLoading: (value: boolean) => void;
  selectIssue: (issue?: IssueSummary) => void;
  hydrateDrawer: (data: Partial<DrawerData>) => void;
  resetDrawer: () => void;
};

function updateColumnIssue(
  columns: IssueBoardColumn[],
  issueNumber: number,
  callback: (issue: IssueSummary) => IssueSummary,
) {
  return columns.map((column) => ({
    ...column,
    issues: column.issues.map((issue) =>
      issue.number === issueNumber ? callback(issue) : issue,
    ),
  }));
}

export const useBoardStore = create<BoardState>((set, get) => ({
  columns: [],
  isLoading: false,
  selectedIssue: undefined,
  drawerData: undefined,
  setColumns(columns) {
    set({ columns });
  },
  setLoading(value) {
    set({ isLoading: value });
  },
  moveIssueOptimistic(issueNumber, toStatus) {
    const { columns } = get();
    let movedIssue: IssueSummary | undefined;
    const withoutIssue = columns.map((column) => {
      const filtered = column.issues.filter((issue) => issue.number !== issueNumber);
      if (filtered.length !== column.issues.length) {
        movedIssue = column.issues.find((issue) => issue.number === issueNumber);
      }
      return { ...column, issues: filtered };
    });

    if (!movedIssue) return undefined;

    const updatedIssue: IssueSummary = { ...movedIssue, status: toStatus };

    const nextColumns = withoutIssue.map((column) =>
      column.status === toStatus
        ? { ...column, issues: [updatedIssue, ...column.issues] }
        : column,
    );

    set({ columns: nextColumns });
    return movedIssue;
  },
  revertIssueMove(issueNumber, originalStatus) {
    const { columns } = get();
    const issue = columns.flatMap((column) => column.issues).find((item) => item.number === issueNumber);
    if (!issue) return;
    const restoredIssue = { ...issue, status: originalStatus };
    const filtered = columns.map((column) => ({
      ...column,
      issues: column.issues.filter((item) => item.number !== issueNumber),
    }));
    const restoredColumns = filtered.map((column) =>
      column.status === originalStatus
        ? { ...column, issues: [restoredIssue, ...column.issues] }
        : column,
    );
    set({ columns: restoredColumns });
  },
  selectIssue(issue) {
    set({ selectedIssue: issue, drawerData: issue ? { issue } : undefined });
  },
  hydrateDrawer(data) {
    set((state) => ({
      selectedIssue: data.issue ?? state.selectedIssue,
      drawerData: {
        ...(state.drawerData ?? {}),
        ...data,
      },
    }));
  },
  resetDrawer() {
    set({ drawerData: undefined, selectedIssue: undefined });
  },
}));
