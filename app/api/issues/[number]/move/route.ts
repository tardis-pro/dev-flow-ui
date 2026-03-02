import { NextRequest, NextResponse } from "next/server";
import { getOctokitForRequest, createUserClient } from "@/lib/github";
import {
  ISSUE_STATUSES,
  WORK_TYPE_LABELS,
  statusToLabel,
  type IssueStatus,
  type WorkType,
} from "@/lib/labels";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callAIAndComment } from "@/lib/orchestrator";
import { getUserKey, type KVEnv } from "@/lib/kv";
import { decryptForUser } from "@/lib/crypto";
import type { IssueSummary } from "@/lib/types";
import type { AIProvider } from "@/lib/ai-client";

type MovePayload = {
  toStatus: IssueStatus;
  owner?: string;
  repo?: string;
};

const AI_PROVIDERS: AIProvider[] = ["gemini", "claude", "qwen"];

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
    // Get octokit client for API operations
    const { client: octokit } = await getOctokitForRequest({ owner, repo });

    // Fetch issue data
    const { data: issueData } = await octokit.issues.get({
      owner,
      repo,
      issue_number: number,
    });

    // Compute updated labels (strip old status, add new)
    const labels = (issueData.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label.name ?? ""))
      .filter((name): name is string => Boolean(name));
    const filtered = labels.filter((label) => !label.startsWith("status:"));
    const updatedLabels = [...filtered, statusToLabel(body.toStatus)];

    // Perform label swap — this is the core of the move operation
    await octokit.issues.update({
      owner,
      repo,
      issue_number: number,
      labels: updatedLabels,
    });

    // Build IssueSummary for AI orchestration
    const issueSummary: IssueSummary = {
      id: issueData.id,
      number,
      title: issueData.title,
      body: issueData.body,
      url: issueData.html_url,
      status: body.toStatus,
      workTypes: updatedLabels.filter((label) =>
        WORK_TYPE_LABELS.includes(label as (typeof WORK_TYPE_LABELS)[number]),
      ) as WorkType[],
      assignees: (issueData.assignees ?? []).map((a) => ({
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
      labels: updatedLabels.map((name) => ({ name })),
      updatedAt: issueData.updated_at,
      repository: { owner, name: repo },
    };

    // Get session for userId (email used as KV key prefix)
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? null;

    // Capture CF env while still in request scope (may be undefined in local dev)
    const cfEnv = (globalThis as unknown as { env?: KVEnv }).env;

    // Fire-and-forget AI orchestration — response returns immediately after label swap
    (async () => {
      // Attempt to find a configured AI provider key
      let foundProvider: AIProvider | null = null;
      let foundApiKey: string | null = null;

      if (userId && cfEnv?.USER_KEYS) {
        for (const provider of AI_PROVIDERS) {
          const encrypted = await getUserKey(cfEnv, userId, provider);
          if (encrypted) {
            foundApiKey = await decryptForUser(encrypted, userId);
            foundProvider = provider;
            break;
          }
        }

        if (!foundProvider) {
          // User has CF env available but no AI key — post informational comment
          const userOctokit = await createUserClient();
          await userOctokit.issues.createComment({
            owner,
            repo,
            issue_number: number,
            body: "Configure an AI provider key in DevFlow settings to enable AI analysis",
          });
          return;
        }
      }

      // Call AI and post analysis comment
      if (foundProvider && foundApiKey) {
        await callAIAndComment({
          octokit,
          owner,
          repo,
          issue: issueSummary,
          phase: body.toStatus,
          userApiKey: { provider: foundProvider, apiKey: foundApiKey },
        });
      }
    })().catch((err) => console.warn("AI comment failed:", err));

    // Return success immediately — label swap is done, AI runs in background
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to move issue status." },
      { status: 500 },
    );
  }
}
