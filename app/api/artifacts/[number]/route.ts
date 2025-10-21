import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getIssueArtifacts } from "@/lib/repo";
import { SAMPLE_ARTIFACTS } from "@/lib/fixtures";

export async function GET(
  request: NextRequest,
  { params }: { params: { number: string } },
) {
  const issueNumber = Number.parseInt(params.number, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
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
