import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getEnv } from "@/lib/env";
import { detectIssueBranch, getCompareForIssue } from "@/lib/repo";
import { SAMPLE_COMPARE } from "@/lib/fixtures";

const env = getEnv();

export async function GET(
  request: NextRequest,
  { params }: { params: { number: string } },
) {
  const issueNumber = Number.parseInt(params.number, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner") ?? env.GITHUB_OWNER;
  const repo = searchParams.get("repo") ?? env.GITHUB_REPO;
  const providedHead = searchParams.get("head") ?? undefined;
  const workType = searchParams.get("workType") ?? undefined;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo are required." },
      { status: 400 },
    );
  }

  try {
    const result = await withOctokit({ owner, repo }, async (octokit) => {
      const { data: repoMeta } = await octokit.repos.get({ owner, repo });
      const base = searchParams.get("base") ?? repoMeta.default_branch;

      const head =
        providedHead ??
        (await detectIssueBranch(octokit, owner, repo, issueNumber, workType));

      if (!head) {
        return { compare: null, branch: null };
      }

      const compare = await getCompareForIssue(octokit, owner, repo, base, head);
      return { compare, branch: head };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ compare: SAMPLE_COMPARE, branch: SAMPLE_COMPARE.headRef, fixture: true });
  }
}
