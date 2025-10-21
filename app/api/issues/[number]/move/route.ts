import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import {
  ISSUE_STATUSES,
  WORK_TYPE_LABELS,
  statusToLabel,
  type IssueStatus,
} from "@/lib/labels";
import { dispatchOrchestrator } from "@/lib/orchestrator";

type MovePayload = {
  toStatus: IssueStatus;
  owner?: string;
  repo?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number: numberStr } = await params;
  const number = Number.parseInt(numberStr, 10);
  if (!Number.isInteger(number)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  let body: MovePayload;
  try {
    body = (await request.json()) as MovePayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!ISSUE_STATUSES.includes(body.toStatus)) {
    return NextResponse.json(
      { error: `Unsupported status "${body.toStatus}".` },
      { status: 400 },
    );
  }

  const { owner, repo } = body;
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo must be provided in the request body." },
      { status: 400 },
    );
  }

  try {
    const issue = await withOctokit(
      { owner, repo },
      async (octokit) => {
        const { data } = await octokit.issues.get({
          owner,
          repo,
          issue_number: number,
        });

        const labels = (data.labels ?? [])
          .map((label) => (typeof label === "string" ? label : label.name ?? ""))
          .filter((name): name is string => Boolean(name));
        const filtered = labels.filter((label) => !label.startsWith("status:"));
        const updatedLabels = [...filtered, statusToLabel(body.toStatus)];

        await octokit.issues.update({
          owner,
          repo,
          issue_number: number,
          labels: updatedLabels,
        });

        return {
          labels: updatedLabels,
          workType:
            (labels.find((label) =>
              WORK_TYPE_LABELS.includes(label as (typeof WORK_TYPE_LABELS)[number]),
            ) as (typeof WORK_TYPE_LABELS)[number] | undefined) ?? null,
        };
      },
    );

    await dispatchOrchestrator({
      owner,
      repo,
      issueNumber: number,
      status: body.toStatus,
      workType: issue.workType,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to move issue status." },
      { status: 500 },
    );
  }
}
