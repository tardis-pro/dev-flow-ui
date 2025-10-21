import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getEnv } from "@/lib/env";
import { getIssueArtifacts } from "@/lib/repo";
import { SAMPLE_ARTIFACTS } from "@/lib/fixtures";

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
      { error: "owner and repo are required." },
      { status: 400 },
    );
  }

  try {
    const artifacts = await withOctokit(
      { owner, repo },
      (octokit) => getIssueArtifacts(octokit, owner, repo, issueNumber),
    );
    return NextResponse.json({ artifacts });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ artifacts: SAMPLE_ARTIFACTS, fixture: true });
  }
}
