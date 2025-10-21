import { NextRequest, NextResponse } from "next/server";
import { ISSUE_STATUSES, type IssueStatus } from "@/lib/labels";
import { fetchIssueSummaries, groupIssuesByStatus } from "@/lib/services/issues";
import { sampleBoard } from "@/lib/fixtures";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo must be specified via query params." },
      { status: 400 },
    );
  }

  const perPage = Number.parseInt(searchParams.get("perPage") ?? "100", 10);
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const assignee = searchParams.get("assignee") || undefined;
  const filterLabels = searchParams
    .getAll("labels")
    .filter((label) => label && !ISSUE_STATUSES.includes(label as IssueStatus));
  const statusFilter = searchParams.getAll("status");
  const query = searchParams.get("q")?.toLowerCase().trim();

  try {
    const statuses = statusFilter
      .map((label) =>
        label.startsWith("status:") ? (label.replace("status:", "") as IssueStatus) : (label as IssueStatus),
      )
      .filter((label) => ISSUE_STATUSES.includes(label));

    const issues = await fetchIssueSummaries({
      owner,
      repo,
      perPage,
      page,
      assignee: assignee ?? undefined,
      labels: filterLabels,
      statuses,
      query,
    });

    return NextResponse.json({
      columns: groupIssuesByStatus(issues),
      meta: { owner, repo, count: issues.length },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        columns: sampleBoard(),
        meta: { owner, repo, count: 0, fixture: true },
        error: "Failed to load issues from GitHub. Falling back to fixture data.",
      },
      { status: 200 },
    );
  }
}
