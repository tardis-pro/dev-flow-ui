import type { AuthenticatedOctokit } from "@/lib/github";
import type { PullRequestSummary } from "@/lib/types";

async function mapPullRequestToSummary(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  pull: any,
): Promise<PullRequestSummary> {
  let ciStatus: PullRequestSummary["ciStatus"] = undefined;
  try {
    if (pull.head?.sha) {
      const { data: status } = await octokit.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref: pull.head.sha,
      });
    ciStatus =
      status.state === "success"
        ? "success"
        : status.state === "failure"
        ? "failure"
        : "pending";
  }
  } catch {}

  const reviewsResponse = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: pull.number,
    per_page: 20,
  });

  const reviewers = reviewsResponse.data.map((review: any) => ({
    login: review.user?.login ?? "unknown",
    avatarUrl: review.user?.avatar_url ?? "",
    state: review.state,
  }));

  return {
    id: pull.id,
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    status: pull.merged ? "merged" : pull.state,
    mergeable: pull.mergeable_state ?? "unknown",
    reviewers,
    stateReason: pull.state_reason,
    latestCommitSha: pull.head?.sha,
    ciStatus,
    geminiSummary: null,
  };
}

export async function getPullRequestSummary(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  const { data: pull } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return mapPullRequestToSummary(octokit, owner, repo, pull);
}

export async function findPullRequestForIssue(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const search = await octokit.search.issuesAndPullRequests({
    q: `repo:${owner}/${repo} type:pr "${issueNumber}" in:body`,
    per_page: 5,
  });

  const candidate = search.data.items.find((item) =>
    item.body?.includes(`#${issueNumber}`),
  );

  if (!candidate) return null;

  return getPullRequestSummary(octokit, owner, repo, candidate.number);
}
