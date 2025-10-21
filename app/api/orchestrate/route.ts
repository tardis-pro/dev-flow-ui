import { NextRequest, NextResponse } from "next/server";
import { dispatchOrchestrator } from "@/lib/orchestrator";
import { ISSUE_STATUSES, WORK_TYPE_LABELS, type IssueStatus, type WorkType } from "@/lib/labels";

type OrchestratePayload = {
  issueNumber: number;
  status: IssueStatus;
  workType?: WorkType | null;
  owner?: string;
  repo?: string;
};

export async function POST(request: NextRequest) {
  let body: OrchestratePayload;
  try {
    body = (await request.json()) as OrchestratePayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(body.issueNumber)) {
    return NextResponse.json(
      { error: "issueNumber must be provided." },
      { status: 400 },
    );
  }

  if (!ISSUE_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Unsupported status "${body.status}".` },
      { status: 400 },
    );
  }

  if (body.workType && !WORK_TYPE_LABELS.includes(body.workType)) {
    return NextResponse.json(
      { error: `Unsupported workType "${body.workType}".` },
      { status: 400 },
    );
  }

  if (!body.owner || !body.repo) {
    return NextResponse.json(
      { error: "owner and repo must be provided in the request body." },
      { status: 400 },
    );
  }

  try {
    await dispatchOrchestrator({
      owner: body.owner,
      repo: body.repo,
      issueNumber: body.issueNumber,
      status: body.status,
      workType: body.workType ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to dispatch orchestrator workflow.",
        details:
          error instanceof Error ? error.message : "Unknown error occurred.",
      },
      { status: 500 },
    );
  }
}
