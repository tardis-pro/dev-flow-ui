import { withOctokit } from "@/lib/github";
import {
  ISSUE_STATUSES,
  WORK_TYPE_LABELS,
  parseStatus,
  statusToLabel,
  type IssueStatus,
} from "@/lib/labels";
import type { IssueSummary, IssueBoardColumn } from "@/lib/types";

type FetchIssueParams = {
  owner: string;
  repo: string;
  perPage?: number;
  page?: number;
  assignee?: string;
  labels?: string[];
  statuses?: IssueStatus[];
  query?: string | null;
};

export function mapIssueToSummary(issue: any, owner: string, repo: string): IssueSummary {
  const labels = issue.labels ?? [];
  const status = parseStatus(labels);
  const workTypes = labels
    .map((label: any) => label.name ?? label)
    .filter((name: string | undefined | null): name is string =>
      Boolean(name && WORK_TYPE_LABELS.includes(name as (typeof WORK_TYPE_LABELS)[number])),
    ) as IssueSummary["workTypes"];

  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    status,
    workTypes,
    labels: labels.map((label: any) => ({
      name: label.name ?? label,
      color: label.color,
    })),
    assignees: (issue.assignees ?? []).map((assignee: any) => ({
      login: assignee.login,
      avatarUrl: assignee.avatar_url,
    })),
    updatedAt: issue.updated_at,
    repository: { owner, name: repo },
    linkedPullRequest: undefined,
  };
}

export function groupIssuesByStatus(issues: IssueSummary[]): IssueBoardColumn[] {
  const columns: Record<IssueStatus, IssueSummary[]> = {
    inception: [],
    discussion: [],
    build: [],
    review: [],
    done: [],
  };

  for (const issue of issues) {
    columns[issue.status].push(issue);
  }

  return ISSUE_STATUSES.map((status) => ({
    status,
    issues: columns[status],
  }));
}

export async function fetchIssueSummaries({
  owner,
  repo,
  perPage = 100,
  page = 1,
  assignee,
  labels = [],
  statuses = [],
  query,
}: FetchIssueParams) {
  return withOctokit({ owner, repo }, async (octokit) => {
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: Math.min(perPage, 100),
      page,
      assignee,
      labels: statuses.length
        ? statuses.map((status) => statusToLabel(status)).join(",")
        : labels.length
        ? labels.join(",")
        : undefined,
    });

    let filtered = data.filter((item) => !item.pull_request);
    if (query) {
      const normalized = query.toLowerCase();
      filtered = filtered.filter((item) => {
        const haystack = `${item.title ?? ""} ${item.body ?? ""}`.toLowerCase();
        return haystack.includes(normalized);
      });
    }

    if (statuses.length) {
      filtered = filtered.filter((issue) => statuses.includes(parseStatus(issue.labels ?? [])));
    }

    return filtered.map((issue) => mapIssueToSummary(issue, owner, repo));
  });
}
