import type { AuthenticatedOctokit } from "@/lib/github";
import type { ArtifactFile, CompareSummary } from "@/lib/types";
import { WORK_TYPE_LABELS } from "@/lib/labels";

type ApiError = { status?: number };

function isGitHubError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "status" in error;
}

export async function fetchFileIfExists(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  path: string,
) {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
    });

    if (Array.isArray(response.data) || response.data.type !== "file") {
      return null;
    }

    const content =
      "content" in response.data && response.data.content
        ? Buffer.from(response.data.content, response.data.encoding as BufferEncoding).toString("utf8")
        : "";

    return {
      path: response.data.path,
      name: response.data.name,
      content,
      sha: response.data.sha,
    };
  } catch (error: unknown) {
    if (isGitHubError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getIssueArtifacts(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const variants = [
    `ops/specs/${issueNumber}__context.md`,
    `ops/specs/${issueNumber}__options.md`,
    `ops/specs/${issueNumber}__decision.md`,
    `ops/specs/${issueNumber}__acceptance.md`,
    `ops/design/${issueNumber}__design.md`,
    `ops/checks/${issueNumber}__review_checklist.md`,
    `ops/tasks/${issueNumber}__tasklist.md`,
  ];

  const shared = [
    "ops/out/RUN_LOG.md",
    "ops/out/PR_SUMMARY.md",
    "ops/out/CI_DIAG.md",
    "ops/out/BLOCKERS.md",
  ];

  const files = await Promise.all(
    [...variants, ...shared].map((path) =>
      fetchFileIfExists(octokit, owner, repo, path),
    ),
  );

  return files.filter(Boolean) as ArtifactFile[];
}

export async function detectIssueBranch(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  issueNumber: number,
  workType?: string | null,
) {
  const typePrefix = workType && WORK_TYPE_LABELS.includes(workType as typeof WORK_TYPE_LABELS[number]) ? `${workType}/` : "";
  const defaultSlug = `${issueNumber}`.padStart(0, "0");
  const candidates = [
    `nav/${workType ?? "feature"}-${issueNumber}`,
    `nav/${workType ?? "feature"}-${issueNumber}-${defaultSlug}`,
    `nav/${issueNumber}`,
    `${typePrefix}${issueNumber}`,
  ];

  for (const branch of candidates) {
    try {
      await octokit.repos.getBranch({ owner, repo, branch });
      return branch;
    } catch (error: unknown) {
      if (isGitHubError(error) && error.status !== 404) {
        throw error;
      }
    }
  }

  return null;
}

export async function getCompareForIssue(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
) {
  const { data } = await octokit.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${base}...${head}`,
  });

  return {
    baseRef: base,
    headRef: head,
    aheadBy: data.ahead_by,
    behindBy: data.behind_by,
    files:
      data.files?.map((file) => ({
        filename: file.filename,
        additions: file.additions,
        deletions: file.deletions,
        status: file.status as CompareSummary["files"][number]["status"],
        patch: file.patch,
      })) ?? [],
    permalinkUrl: data.html_url,
  } satisfies CompareSummary;
}
