import type { Octokit } from "@octokit/rest";
import type { IssueStatus } from "@/lib/labels";

export type DevFlowComment = {
  phase: IssueStatus;
  issueNumber: number;
  content: string;
  idempotencyKey: string;
};

export type PostedComment = {
  id: number;
  url: string;
  created: boolean;
};

export type CommentSummary = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  isDevFlow: boolean;
  phase?: string;
};

const DEVFLOW_MARKER_PREFIX = "<!-- devflow:";
const DEVFLOW_MARKER_SUFFIX = " -->";

function buildMarker(idempotencyKey: string): string {
  return `${DEVFLOW_MARKER_PREFIX}${idempotencyKey}${DEVFLOW_MARKER_SUFFIX}`;
}

function extractPhaseFromKey(idempotencyKey: string): string | undefined {
  // Key format: {phase}-{issueNumber}-{timestamp}
  const parts = idempotencyKey.split("-");
  if (parts.length >= 3) {
    return parts[0];
  }
  return undefined;
}

function parseDevFlowMarker(body: string): { isDevFlow: boolean; phase?: string } {
  const markerStart = body.indexOf(DEVFLOW_MARKER_PREFIX);
  if (markerStart === -1) {
    return { isDevFlow: false };
  }
  const keyStart = markerStart + DEVFLOW_MARKER_PREFIX.length;
  const keyEnd = body.indexOf(DEVFLOW_MARKER_SUFFIX, keyStart);
  if (keyEnd === -1) {
    return { isDevFlow: false };
  }
  const idempotencyKey = body.slice(keyStart, keyEnd);
  const phase = extractPhaseFromKey(idempotencyKey);
  return { isDevFlow: true, phase };
}

export async function postDevFlowComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  comment: DevFlowComment,
): Promise<PostedComment> {
  const marker = buildMarker(comment.idempotencyKey);

  const { data: existingComments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: comment.issueNumber,
    per_page: 100,
  });

  const existing = existingComments.find(
    (c) => typeof c.body === "string" && c.body.includes(marker),
  );

  if (existing) {
    return {
      id: existing.id,
      url: existing.html_url,
      created: false,
    };
  }

  const body = `${comment.content}\n\n${marker}`;

  const { data: created } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: comment.issueNumber,
    body,
  });

  return {
    id: created.id,
    url: created.html_url,
    created: true,
  };
}

export async function getDevFlowComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<CommentSummary[]> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return comments.map((c) => {
    const body = c.body ?? "";
    const { isDevFlow, phase } = parseDevFlowMarker(body);

    const summary: CommentSummary = {
      id: c.id,
      author: c.user?.login ?? "unknown",
      body,
      createdAt: c.created_at,
      isDevFlow,
    };

    if (phase !== undefined) {
      summary.phase = phase;
    }

    return summary;
  });
}
