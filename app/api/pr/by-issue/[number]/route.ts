import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getEnv } from "@/lib/env";
import { findPullRequestForIssue } from "@/lib/services/pr";

const env = getEnv();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const issueNumber = Number.parseInt(number, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? env.GITHUB_OWNER;
  const repo = searchParams.get("repo") ?? env.GITHUB_REPO;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo must be provided." },
      { status: 400 },
    );
  }

  try {
    const result = await withOctokit(
      { owner, repo },
      (octokit) => findPullRequestForIssue(octokit, owner, repo, issueNumber),
    );
    return NextResponse.json({ pullRequest: result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to resolve pull request for issue." },
      { status: 500 },
    );
  }
}
