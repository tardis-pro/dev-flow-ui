import { withOctokit } from "@/lib/github";
import { getEnv } from "@/lib/env";
import type { IssueStatus, WorkType } from "@/lib/labels";

type DispatchParams = {
  owner: string;
  repo: string;
  workflowPath?: string;
  issueNumber: number;
  status: IssueStatus;
  workType?: WorkType | null;
};

export async function dispatchOrchestrator(params: DispatchParams) {
  const env = getEnv();
  const workflow =
    params.workflowPath ?? env.ORCHESTRATOR_WORKFLOW ?? ".github/workflows/devflow.yml";

  return withOctokit(
    { owner: params.owner, repo: params.repo, prefer: "installation" },
    async (octokit, owner, repo) => {
      await octokit.request(
        "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
        {
          owner,
          repo,
          workflow_id: workflow,
          ref: "main",
          inputs: {
            issue: String(params.issueNumber),
            status: params.status,
            workType: params.workType ?? "",
          },
        },
      );
    },
  );
}
