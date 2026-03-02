import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createUserClient } from "@/lib/github";

const DEVFLOW_LABELS = [
  { name: "status:inception", color: "1d76db" },
  { name: "status:discussion", color: "0e8a16" },
  { name: "status:build", color: "fbca04" },
  { name: "status:review", color: "d93f0b" },
  { name: "status:done", color: "6f42c1" },
  { name: "feature", color: "0075ca" },
  { name: "bugfix", color: "d73a4a" },
  { name: "refactor", color: "e4e669" },
  { name: "docs", color: "0e8a16" },
  { name: "chore", color: "bfdadc" },
];

const WORKFLOW_CONTENT = `name: DevFlow Orchestrator
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number to process'
        required: true
      phase:
        description: 'Workflow phase'
        required: true
jobs:
  orchestrate:
    uses: tardis-pro/ai-dev-workflow-action/.github/workflows/orchestrator-multi-provider.yml@main
    with:
      issue_number: \${{ inputs.issue_number }}
      phase: \${{ inputs.phase }}
    secrets: inherit
`;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { owner?: string; repo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { owner, repo } = body;
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo are required" },
      { status: 400 }
    );
  }

  const octokit = await createUserClient();

  let labelsCreated = 0;
  let labelsSkipped = 0;

  // Create labels — idempotent (skip 422 conflicts)
  for (const label of DEVFLOW_LABELS) {
    try {
      await octokit.rest.issues.createLabel({ owner, repo, ...label });
      labelsCreated++;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 422) {
        labelsSkipped++;
      } else {
        console.warn(`Failed to create label ${label.name}:`, status);
        labelsSkipped++;
      }
    }
  }

  // Check if workflow file already exists
  let prUrl: string | undefined;
  let alreadyBootstrapped = false;

  try {
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".github/workflows/devflow.yml",
    });
    // File exists — already bootstrapped
    alreadyBootstrapped = true;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      // Unexpected error — still return labels result
      console.warn("Error checking workflow file:", status);
    } else {
      // File doesn't exist — create branch + commit + PR
      try {
        // Get default branch SHA
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
        const defaultBranch = repoData.default_branch;
        const { data: refData } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${defaultBranch}`,
        });
        const defaultSha = refData.object.sha;

        // Create branch (idempotent — catch 422 if exists)
        try {
          await octokit.rest.git.createRef({
            owner,
            repo,
            ref: "refs/heads/setup/devflow",
            sha: defaultSha,
          });
        } catch (branchErr: unknown) {
          const branchStatus = (branchErr as { status?: number }).status;
          if (branchStatus !== 422) throw branchErr;
          // Branch already exists — continue
        }

        // Commit workflow file
        const contentBase64 = btoa(WORKFLOW_CONTENT);
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: ".github/workflows/devflow.yml",
          message: "chore: add DevFlow workflow",
          content: contentBase64,
          branch: "setup/devflow",
        });

        // Check for existing open PR before creating
        const { data: existingPRs } = await octokit.rest.pulls.list({
          owner,
          repo,
          state: "open",
          head: `${owner}:setup/devflow`,
        });

        if (existingPRs.length > 0) {
          prUrl = existingPRs[0].html_url;
        } else {
          const { data: pr } = await octokit.rest.pulls.create({
            owner,
            repo,
            title: "chore: add DevFlow workflow",
            head: "setup/devflow",
            base: defaultBranch,
            body: "Adds the DevFlow orchestrator workflow. Merge this PR to enable AI-powered issue analysis.",
          });
          prUrl = pr.html_url;
        }
      } catch (prErr: unknown) {
        console.warn("Failed to create workflow PR:", prErr);
      }
    }
  }

  return NextResponse.json(
    {
      labels_created: labelsCreated,
      labels_skipped: labelsSkipped,
      pr_url: prUrl,
      already_bootstrapped: alreadyBootstrapped,
    },
    { status: 201 }
  );
}
