import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authOptions } from "@/lib/auth";
import { createUserClient } from "@/lib/github";
import { getUserKey, type KVEnv } from "@/lib/kv";
import { decryptForUser } from "@/lib/crypto";
import { callAI, type AIProvider } from "@/lib/ai-client";
import { getPromptForPhase } from "@/lib/prompts/index";
import { buildContextForIssue } from "@/lib/context-builder";
import { postDevFlowComment, getDevFlowComments } from "@/lib/github-comments";
import { parseStatus, WORK_TYPE_LABELS, type IssueStatus } from "@/lib/labels";
import { resolveUserId } from "@/lib/services/user";
import type { D1Env } from "@/lib/db";
import type { IssueSummary } from "@/lib/types";
import type { ConversationMessage } from "@/lib/prompts/types";

export const runtime = "nodejs";

const AI_PROVIDERS: AIProvider[] = ["gemini", "claude", "qwen", "glm", "minimax", "mercury"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { env } = getCloudflareContext();
  const userId = await resolveUserId(session, env as D1Env);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { number: numberStr } = await params;
  const issueNumber = parseInt(numberStr, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  let body: { owner?: string; repo?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { owner, repo, message } = body;
  if (!owner || !repo || !message) {
    return NextResponse.json({ error: "owner, repo, and message are required." }, { status: 400 });
  }

  let foundProvider: AIProvider | null = null;
  let foundApiKey: string | null = null;
  for (const provider of AI_PROVIDERS) {
    const encrypted = await getUserKey(env as KVEnv, userId, provider);
    if (encrypted) {
      foundApiKey = await decryptForUser(encrypted, userId);
      foundProvider = provider;
      break;
    }
  }
  if (!foundProvider || !foundApiKey) {
    return NextResponse.json({ error: "No AI provider configured" }, { status: 400 });
  }

  try {
    const octokit = await createUserClient();

    const { data: userCommentData } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: message,
    });

    const { data: issueData } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const phase: IssueStatus = parseStatus(
      issueData.labels.map((l) => ({ name: typeof l === "string" ? l : (l.name ?? "") }))
    );

    const allComments = await getDevFlowComments(octokit, owner, repo, issueNumber);
    const conversationHistory: ConversationMessage[] = allComments.map((c) => ({
      role: c.isDevFlow ? "ai" : "user",
      content: c.body,
      createdAt: c.createdAt,
    }));

    const labelNames = issueData.labels.map((l) =>
      typeof l === "string" ? l : (l.name ?? "")
    );
    const workTypes = labelNames.filter((name) =>
      WORK_TYPE_LABELS.includes(name as (typeof WORK_TYPE_LABELS)[number])
    ) as IssueSummary["workTypes"];

    const issueSummary: IssueSummary = {
      id: issueData.id,
      number: issueNumber,
      title: issueData.title,
      body: issueData.body,
      url: issueData.html_url,
      status: phase,
      workTypes,
      assignees: (issueData.assignees ?? []).map((a) => ({
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
      labels: labelNames.map((name) => ({ name })),
      updatedAt: issueData.updated_at,
      repository: { owner, name: repo },
    };

    const context = await buildContextForIssue(octokit, owner, repo, issueSummary, conversationHistory);
    const prompt = getPromptForPhase(phase, context);
    const maxTokens = foundProvider === "glm" ? 4000 : 2000;
    const aiResult = await callAI({
      provider: foundProvider,
      apiKey: foundApiKey,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens,
    });

    const idempotencyKey = `reply-${issueNumber}-${Date.now()}`;
    const postedAiComment = await postDevFlowComment(octokit, owner, repo, {
      phase,
      issueNumber,
      content: aiResult.content,
      idempotencyKey,
    });

    return NextResponse.json({
      userComment: {
        id: userCommentData.id,
        url: userCommentData.html_url,
      },
      aiComment: {
        id: postedAiComment.id,
        url: postedAiComment.url,
        content: aiResult.content,
      },
    });
  } catch (error) {
    console.error("Conversation reply failed:", error);
    return NextResponse.json(
      { error: "Failed to process conversation reply." },
      { status: 500 },
    );
  }
}
