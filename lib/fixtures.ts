import type { IssueBoardColumn, IssueSummary, WorkflowRunSummary, CompareSummary, ArtifactFile } from "@/lib/types";

const now = new Date();

function daysAgo(days: number) {
  const copy = new Date(now);
  copy.setDate(copy.getDate() - days);
  return copy.toISOString();
}

export const SAMPLE_ISSUES: IssueSummary[] = [
  {
    id: 1,
    number: 123,
    title: "Implement GraphQL orchestrator for Navratna",
    url: "https://github.com/example/navratna/issues/123",
    status: "discussion",
    workTypes: ["feature"],
    labels: [
      { name: "status:discussion", color: "0EA5E9" },
      { name: "feature", color: "22C55E" },
    ],
    assignees: [{ login: "alice", avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4" }],
    updatedAt: daysAgo(1),
    repository: { owner: "tardis-pro", name: "navratna" },
    linkedPullRequest: undefined,
  },
  {
    id: 2,
    number: 124,
    title: "Add Gemini review surface",
    url: "https://github.com/example/navratna/issues/124",
    status: "build",
    workTypes: ["feature"],
    labels: [
      { name: "status:build", color: "FACC15" },
      { name: "feature", color: "22C55E" },
    ],
    assignees: [{ login: "bob", avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4" }],
    updatedAt: daysAgo(2),
    repository: { owner: "tardis-pro", name: "navratna" },
    linkedPullRequest: undefined,
  },
  {
    id: 3,
    number: 125,
    title: "Stabilize orchestrator workflows",
    url: "https://github.com/example/navratna/issues/125",
    status: "review",
    workTypes: ["bugfix"],
    labels: [
      { name: "status:review", color: "F97316" },
      { name: "bugfix", color: "F97316" },
    ],
    assignees: [{ login: "charlie", avatarUrl: "https://avatars.githubusercontent.com/u/3?v=4" }],
    updatedAt: daysAgo(3),
    repository: { owner: "tardis-pro", name: "navratna" },
    linkedPullRequest: undefined,
  },
];

export function sampleBoard(): IssueBoardColumn[] {
  return [
    { status: "inception", issues: [] },
    { status: "discussion", issues: [SAMPLE_ISSUES[0]] },
    { status: "build", issues: [SAMPLE_ISSUES[1]] },
    { status: "review", issues: [SAMPLE_ISSUES[2]] },
    { status: "done", issues: [] },
  ];
}

export const SAMPLE_ARTIFACTS: ArtifactFile[] = [
  {
    path: "ops/specs/125__context.md",
    name: "125__context.md",
    content: "# Context\n\nSample context fixture.",
  },
  {
    path: "ops/out/PR_SUMMARY.md",
    name: "PR_SUMMARY.md",
    content: "## Summary\n\n- Sample change set\n- Ready for review",
  },
];

export const SAMPLE_COMPARE: CompareSummary = {
  baseRef: "main",
  headRef: "nav/feature-125-sample",
  aheadBy: 3,
  behindBy: 0,
  permalinkUrl: "https://github.com/example/navratna/compare/main...nav/feature-125-sample",
  files: [
    {
      filename: "frontend/app/page.tsx",
      additions: 12,
      deletions: 2,
      status: "modified",
      patch: "@@ -1,4 +1,4 @@\n-// old\n+// new",
    },
  ],
};

export const SAMPLE_RUNS: WorkflowRunSummary[] = [
  {
    id: 1,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    htmlUrl: "https://github.com/example/navratna/actions/runs/1",
    durationMs: 420000,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    runNumber: 42,
  },
];
