import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { getEnv } from "@/lib/env";
import type { WorkflowRunSummary } from "@/lib/types";

const env = getEnv();

export async function GET(
  request: NextRequest,
  { params }: { params: { number: string } },
) {
  const number = Number.parseInt(params.number, 10);
  if (!Number.isInteger(number)) {
    return NextResponse.json({ error: "Invalid pull request number." }, { status: 400 });
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
    const runs = await withOctokit({ owner, repo }, async (octokit) => {
      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number: number,
      });

      const branch = pr.data.head.ref;

      const { data } = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        per_page: 20,
      });

      return data.workflow_runs.map(
        (run): WorkflowRunSummary => ({
          id: run.id,
          name: run.name ?? run.display_title ?? "Workflow Run",
          event: run.event,
          status: run.status ?? "unknown",
          conclusion: run.conclusion,
          htmlUrl: run.html_url,
          durationMs:
            run.run_started_at && run.updated_at
              ? new Date(run.updated_at).getTime() -
                new Date(run.run_started_at).getTime()
              : undefined,
          createdAt: run.created_at ?? "",
          updatedAt: run.updated_at ?? "",
          runNumber: run.run_number,
        }),
      );
    });

    return NextResponse.json({ runs });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to load workflow runs.",
        details: error?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}
