import type { AuthenticatedOctokit } from "@/lib/github";
import type { IssueSummary } from "@/lib/types";
import type { IssueStatus } from "@/lib/labels";
import type { AIProvider } from "@/lib/ai-client";
import { callAI } from "@/lib/ai-client";
import { getPromptForPhase } from "@/lib/prompts/index";
import { buildContextForIssue } from "@/lib/context-builder";
import { postDevFlowComment } from "@/lib/github-comments";

export type OrchestratorParams = {
  octokit: AuthenticatedOctokit;
  owner: string;
  repo: string;
  issue: IssueSummary;
  phase: IssueStatus;
  userApiKey: { provider: AIProvider; apiKey: string };
};

export type OrchestratorResult = {
  commentId: number;
  commentUrl: string;
};

const PHASE_EMOJIS: Record<IssueStatus, string> = {
  inception: "💡",
  discussion: "💬",
  build: "🔨",
  review: "🔍",
  done: "✅",
};

const PHASE_TITLES: Record<IssueStatus, string> = {
  inception: "Inception Analysis",
  discussion: "Design Discussion",
  build: "Build Plan",
  review: "Code Review",
  done: "Release Notes",
};

function phaseEmoji(phase: IssueStatus): string {
  return PHASE_EMOJIS[phase];
}

function phaseTitle(phase: IssueStatus): string {
  return PHASE_TITLES[phase];
}

function sanitizeError(message: string, apiKey: string): string {
  // Split-join pattern is safer than regex for keys with special chars
  return message.split(apiKey).join("[REDACTED]");
}

/**
 * Calls AI to analyze an issue and posts the result as a GitHub comment.
 *
 * Flow:
 * 1. Build context for the issue (repo, files, commits, etc.)
 * 2. Get phase-specific prompt
 * 3. Call AI with user's API key
 * 4. Post result as a comment (or error message if AI fails)
 *
 * @param params - Orchestrator parameters including octokit, repo info, issue, phase, and user API key
 * @returns The posted comment ID and URL
 */
export async function callAIAndComment(
  params: OrchestratorParams,
): Promise<OrchestratorResult> {
  // 1. Build context for issue
  const context = await buildContextForIssue(
    params.octokit,
    params.owner,
    params.repo,
    params.issue,
  );

  // 2. Get phase-specific prompt
  const prompt = getPromptForPhase(params.phase, context);

  // 3. Call AI and build comment content
  let commentContent: string;
  try {
    const aiResult = await callAI({
      provider: params.userApiKey.provider,
      apiKey: params.userApiKey.apiKey,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      maxTokens: 2000,
    });
    commentContent = `## ${phaseEmoji(params.phase)} ${phaseTitle(params.phase)}\n\n${aiResult.content}`;
  } catch (error) {
    // Sanitize error message - NEVER include apiKey
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const sanitizedError = sanitizeError(
      errorMessage,
      params.userApiKey.apiKey,
    );
    commentContent = `AI analysis failed. You can retry from the DevFlow dashboard.\n\n_Error: ${sanitizedError}_`;
  }

  // 4. Post comment with idempotency key
  const idempotencyKey = `${params.phase}-${params.issue.number}-${Date.now()}`;
  const posted = await postDevFlowComment(params.octokit, params.owner, params.repo, {
    phase: params.phase,
    issueNumber: params.issue.number,
    content: commentContent,
    idempotencyKey,
  });

  return {
    commentId: posted.id,
    commentUrl: posted.url,
  };
}
