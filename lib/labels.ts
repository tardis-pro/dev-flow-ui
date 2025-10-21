export const ISSUE_STATUSES = [
  "inception",
  "discussion",
  "build",
  "review",
  "done",
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const STATUS_LABEL_PREFIX = "status:";

export const DEFAULT_STATUS: IssueStatus = "inception";

export function statusToLabel(status: IssueStatus) {
  return `${STATUS_LABEL_PREFIX}${status}`;
}

export function parseStatus(labels: Array<{ name?: string | null }>) {
  for (const label of labels) {
    if (!label?.name) continue;
    if (label.name.startsWith(STATUS_LABEL_PREFIX)) {
      const status = label.name.split(":")[1];
      if (ISSUE_STATUSES.includes(status as IssueStatus)) {
        return status as IssueStatus;
      }
    }
  }
  return DEFAULT_STATUS;
}

export function nextStatus(status: IssueStatus): IssueStatus {
  const index = ISSUE_STATUSES.indexOf(status);
  return ISSUE_STATUSES[Math.min(index + 1, ISSUE_STATUSES.length - 1)];
}

export const WORK_TYPE_LABELS = [
  "feature",
  "refactor",
  "performance",
  "dep-bump",
  "bugfix",
  "docs",
  "chore",
] as const;

export type WorkType = (typeof WORK_TYPE_LABELS)[number];
