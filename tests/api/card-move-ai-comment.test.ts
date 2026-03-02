import { describe, it, expect, vi, beforeEach } from "vitest";
import { postDevFlowComment, getDevFlowComments } from "@/lib/github-comments";
import type { IssueSummary } from "@/lib/types";

// Mock dependencies for callAIAndComment tests
vi.mock("@/lib/context-builder", () => ({
  buildContextForIssue: vi.fn(),
}));

vi.mock("@/lib/prompts/index", () => ({
  getPromptForPhase: vi.fn(),
}));

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

import { buildContextForIssue } from "@/lib/context-builder";
import { getPromptForPhase } from "@/lib/prompts/index";
import { callAI } from "@/lib/ai-client";
import { callAIAndComment } from "@/lib/orchestrator";

const OWNER = "test-owner";
const REPO = "test-repo";

// Create a mock Octokit with in-memory comment storage
function createMockOctokit(initialComments: Array<{
  id: number;
  body: string;
  html_url: string;
  user: { login: string };
  created_at: string;
}> = []) {
  const comments = [...initialComments];
  let nextId = 1000;

  const listComments = vi.fn(async () => ({ data: comments }));
  const createComment = vi.fn(async (params: { body: string }) => {
    const newComment = {
      id: ++nextId,
      body: params.body,
      html_url: `https://github.com/${OWNER}/${REPO}/issues/42#issuecomment-${nextId}`,
      user: { login: "devflow-user" },
      created_at: new Date().toISOString(),
    };
    comments.push(newComment);
    return { data: newComment };
  });

  return {
    rest: {
      issues: { listComments, createComment },
    },
  };
}

const MOCK_ISSUE: IssueSummary = {
  id: 1,
  number: 42,
  title: "Test Issue",
  body: "Test body",
  url: "https://github.com/owner/repo/issues/42",
  status: "build",
  workTypes: [],
  assignees: [],
  labels: [],
  updatedAt: "2024-01-01T00:00:00Z",
  repository: { owner: OWNER, name: REPO },
};

describe("postDevFlowComment — idempotency", () => {
  it("with same idempotencyKey called twice - only one comment created", async () => {
    const octokit = createMockOctokit();
    const comment = {
      phase: "build" as const,
      issueNumber: 42,
      content: "DevFlow analysis complete.",
      idempotencyKey: "build-42-1700000000000",
    };

    // First call — should create a comment
    const result1 = await postDevFlowComment(octokit as never, OWNER, REPO, comment);
    expect(result1.created).toBe(true);
    expect(result1.id).toBeGreaterThan(0);

    // Second call — should detect existing marker and skip creation
    const result2 = await postDevFlowComment(octokit as never, OWNER, REPO, comment);
    expect(result2.created).toBe(false);
    // Should reuse same ID
    expect(result2.id).toBe(result1.id);

    // createComment should only be called once
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
  });

  it("different idempotencyKeys create separate comments", async () => {
    const octokit = createMockOctokit();

    const result1 = await postDevFlowComment(octokit as never, OWNER, REPO, {
      phase: "build" as const,
      issueNumber: 42,
      content: "First analysis.",
      idempotencyKey: "build-42-1700000000001",
    });

    const result2 = await postDevFlowComment(octokit as never, OWNER, REPO, {
      phase: "build" as const,
      issueNumber: 42,
      content: "Second analysis.",
      idempotencyKey: "build-42-1700000000002",
    });

    expect(result1.created).toBe(true);
    expect(result2.created).toBe(true);
    expect(result1.id).not.toBe(result2.id);
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(2);
  });
});

describe("getDevFlowComments — filtering", () => {
  it("returns all comments with isDevFlow flag correctly set", async () => {
    const devflowMarker = "<!-- devflow:review-7-1700000000000 -->";
    const regularBody = "Just a regular comment without any marker";

    const octokit = createMockOctokit([
      {
        id: 301,
        body: `DevFlow review done.\n\n${devflowMarker}`,
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-301",
        user: { login: "devflow-bot" },
        created_at: "2024-02-01T00:00:00Z",
      },
      {
        id: 302,
        body: regularBody,
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-302",
        user: { login: "alice" },
        created_at: "2024-02-01T01:00:00Z",
      },
    ]);

    const results = await getDevFlowComments(octokit as never, OWNER, REPO, 7);

    expect(results).toHaveLength(2);

    const devflowComment = results.find((c) => c.id === 301);
    expect(devflowComment?.isDevFlow).toBe(true);
    expect(devflowComment?.phase).toBe("review");
    expect(devflowComment?.author).toBe("devflow-bot");

    const regularComment = results.find((c) => c.id === 302);
    expect(regularComment?.isDevFlow).toBe(false);
    expect(regularComment?.phase).toBeUndefined();
    expect(regularComment?.author).toBe("alice");
  });
});

describe("callAIAndComment — error sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("error response does not contain the API key string", async () => {
    const sensitiveApiKey = "sk-test-secret-XYZ123";
    const octokit = createMockOctokit();

    vi.mocked(buildContextForIssue).mockResolvedValue({
      issue: { number: 42, title: "Test", body: "Test body", labels: [] },
      repo: {
        owner: OWNER,
        name: REPO,
        fileTree: [],
        stack: { frameworks: [] },
        recentCommits: [],
        openPRs: [],
      },
      phase: "build",
      relatedFiles: [],
    } as never);

    vi.mocked(getPromptForPhase).mockReturnValue({
      systemPrompt: "System prompt",
      userPrompt: "User prompt",
    });

    // Mock callAI to throw an error that contains the API key
    vi.mocked(callAI).mockRejectedValue(
      new Error(`API error: invalid key ${sensitiveApiKey}`)
    );

    const result = await callAIAndComment({
      octokit: octokit as never,
      owner: OWNER,
      repo: REPO,
      issue: MOCK_ISSUE,
      phase: "build",
      userApiKey: { provider: "claude", apiKey: sensitiveApiKey },
    });

    // Should still return a result (error posted as comment)
    expect(result.commentId).toBeGreaterThan(0);
    expect(result.commentUrl).toBeDefined();

    // Verify the posted comment body does NOT contain the API key
    const postedBody = octokit.rest.issues.createComment.mock.calls[0][0].body as string;
    expect(postedBody).not.toContain(sensitiveApiKey);
    expect(postedBody).toContain("[REDACTED]");
    expect(postedBody).toContain("AI analysis failed");
  });

  it("successful AI call posts formatted comment with phase emoji", async () => {
    const octokit = createMockOctokit();

    vi.mocked(buildContextForIssue).mockResolvedValue({
      issue: { number: 42, title: "Test", body: "Test body", labels: [] },
      repo: {
        owner: OWNER,
        name: REPO,
        fileTree: [],
        stack: { frameworks: [] },
        recentCommits: [],
        openPRs: [],
      },
      phase: "build",
      relatedFiles: [],
    } as never);

    vi.mocked(getPromptForPhase).mockReturnValue({
      systemPrompt: "System prompt",
      userPrompt: "User prompt",
    });

    vi.mocked(callAI).mockResolvedValue({
      content: "Here is the build plan.",
      provider: "gemini",
      model: "gemini-1.5-pro",
    });

    const result = await callAIAndComment({
      octokit: octokit as never,
      owner: OWNER,
      repo: REPO,
      issue: MOCK_ISSUE,
      phase: "build",
      userApiKey: { provider: "gemini", apiKey: "AIza-test-key" },
    });

    expect(result.commentId).toBeGreaterThan(0);

    const postedBody = octokit.rest.issues.createComment.mock.calls[0][0].body as string;
    expect(postedBody).toContain("🔨");
    expect(postedBody).toContain("Build Plan");
    expect(postedBody).toContain("Here is the build plan.");
    // Should contain idempotency marker
    expect(postedBody).toContain("<!-- devflow:");
  });
});
