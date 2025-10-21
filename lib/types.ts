import type { IssueStatus, WorkType } from "@/lib/labels";

export type IssueSummary = {
  id: number;
  number: number;
  title: string;
  url: string;
  status: IssueStatus;
  workTypes: WorkType[];
  assignees: Array<{
    login: string;
    avatarUrl: string;
  }>;
  labels: Array<{
    name: string;
    color?: string | null;
  }>;
  updatedAt: string;
  repository: {
    owner: string;
    name: string;
  };
  linkedPullRequest?: PullRequestSummary;
};

export type PullRequestSummary = {
  id: number;
  number: number;
  title: string;
  url: string;
  status: "open" | "closed" | "merged";
  mergeable: "mergeable" | "conflicting" | "unknown";
  reviewers: Array<{
    login: string;
    avatarUrl: string;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
  }>;
  stateReason?: string | null;
  latestCommitSha?: string;
  ciStatus?: "success" | "failure" | "pending";
  geminiSummary?: string | null;
};

export type IssueBoardColumn = {
  status: IssueStatus;
  issues: IssueSummary[];
};

export type ArtifactFile = {
  path: string;
  name: string;
  content: string;
};

export type DiffStat = {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
  status: "modified" | "added" | "removed" | "renamed";
};

export type CompareSummary = {
  baseRef: string;
  headRef: string;
  aheadBy: number;
  behindBy: number;
  files: DiffStat[];
  permalinkUrl?: string;
};

export type WorkflowRunSummary = {
  id: number;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
};
