import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getPullRequestSummary } from "@/lib/services/pr";

export async function GET(
  request: NextRequest,
  { params }: { params: { number: string } },
) {
  const pullNumber = Number.parseInt(params.number, 10);
  if (!Number.isInteger(pullNumber)) {
    return NextResponse.json({ error: "Invalid pull request number." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo must be provided." },
      { status: 400 },
    );
  }

  try {
    const summary = await withOctokit(
      { owner, repo },
      (octokit) => getPullRequestSummary(octokit, owner, repo, pullNumber),
    );
    return NextResponse.json({ pullRequest: summary });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load pull request." },
      { status: 500 },
    );
  }
}
