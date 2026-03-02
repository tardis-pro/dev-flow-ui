import { describe, it, expect, vi, beforeEach } from "vitest";
import { callAIAndComment, type OrchestratorParams } from "@/lib/orchestrator";
import type { AuthenticatedOctokit } from "@/lib/github";
import type { PhasePrompt } from "@/lib/prompts/types";

// Mock dependencies
vi.mock("@/lib/context-builder", () => ({
  buildContextForIssue: vi.fn(),
}));

vi.mock("@/lib/prompts/index", () => ({
  getPromptForPhase: vi.fn(),
}));

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

vi.mock("@/lib/github-comments", () => ({
  postDevFlowComment: vi.fn(),
}));

// Import mocked functions
import { buildContextForIssue } from "@/lib/context-builder";
import { getPromptForPhase } from "@/lib/prompts/index";
import { callAI } from "@/lib/ai-client";
import { postDevFlowComment } from "@/lib/github-comments";

// Create mock Octokit
function createMockOctokit() {
  return {} as unknown as AuthenticatedOctokit;
}

const MOCK_ISSUE = {
  id: 1,
  number: 42,
  title: "Test Issue",
  body: "Test body",
  url: "https://github.com/owner/repo/issues/42",
  status: "inception" as const,
  workTypes: [],
  assignees: [],
  labels: [],
  updatedAt: "2024-01-01T00:00:00Z",
  repository: { owner: "owner", name: "repo" },
};

const MOCK_CONTEXT = {
  issue: {
    number: 42,
    title: "Test Issue",
    body: "Test body",
    labels: [],
  },
  repo: {
    owner: "owner",
    name: "repo",
    fileTree: [],
    stack: {},
    recentCommits: [],
    openPRs: [],
  },
  phase: "inception",
  relatedFiles: [],
};

const MOCK_PROMPT: PhasePrompt = {
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Analyze this issue.",
};

describe("callAIAndComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path - calls AI and posts comment with correct content", async () => {
    const mockOctokit = createMockOctokit();

    // Setup mocks
    vi.mocked(buildContextForIssue).mockResolvedValue(MOCK_CONTEXT);
    vi.mocked(getPromptForPhase).mockReturnValue(MOCK_PROMPT);
    vi.mocked(callAI).mockResolvedValue({
      content: "AI analysis result here.",
          provider: "gemini",
          model: "gemini-2.0-flash",
          tokensUsed: 100,
        });
    vi.mocked(postDevFlowComment).mockResolvedValue({
          id: 999,
          url: "https://github.com/owner/repo/issues/42#issuecomment-999",
          created: true,
        });

    const params: OrchestratorParams = {
          octokit: mockOctokit,
          owner: "owner",
          repo: "repo",
          issue: MOCK_ISSUE,
          phase: "inception",
          userApiKey: { provider: "gemini", apiKey: "test-api-key-12345" },
        };

    const result = await callAIAndComment(params);

    // Verify result
    expect(result.commentId).toBe(999);
    expect(result.commentUrl).toBe(
          "https://github.com/owner/repo/issues/42#issuecomment-999",
        );

    // Verify buildContextForIssue was called with correct args
    expect(vi.mocked(buildContextForIssue)).toHaveBeenCalledWith(
          mockOctokit,
          "owner",
          "repo",
          MOCK_ISSUE,
        );

    // Verify getPromptForPhase was called with correct args
    expect(vi.mocked(getPromptForPhase)).toHaveBeenCalledWith(
          "inception",
          MOCK_CONTEXT,
        );

    // Verify callAI was called with correct args
    expect(vi.mocked(callAI)).toHaveBeenCalledWith({
          provider: "gemini",
          apiKey: "test-api-key-12345",
          systemPrompt: "You are a helpful assistant.",
          userPrompt: "Analyze this issue.",
          maxTokens: 2000,
        });

    // Verify postDevFlowComment was called with content containing phase header
    const postedComment = vi.mocked(postDevFlowComment).mock.calls[0][3];
    expect(postedComment.content).toContain("## 💡 Inception Analysis");
    expect(postedComment.content).toContain("AI analysis result here.");
    expect(postedComment.phase).toBe("inception");
    expect(postedComment.issueNumber).toBe(42);
    expect(postedComment.idempotencyKey).toMatch(/^inception-42-\d+$/);
  });

  it("AI error - posts error comment without apiKey in message", async () => {
    const mockOctokit = createMockOctokit();
    const sensitiveApiKey = "super-secret-key-XYZ123";

    // Setup mocks
    vi.mocked(buildContextForIssue).mockResolvedValue(MOCK_CONTEXT);
    vi.mocked(getPromptForPhase).mockReturnValue(MOCK_PROMPT);
    vi.mocked(callAI).mockRejectedValue(new Error(`API error: invalid key ${sensitiveApiKey}`));
    vi.mocked(postDevFlowComment).mockResolvedValue({
          id: 888,
          url: "https://github.com/owner/repo/issues/42#issuecomment-888",
          created: true,
        });

    const params: OrchestratorParams = {
          octokit: mockOctokit,
          owner: "owner",
          repo: "repo",
          issue: MOCK_ISSUE,
          phase: "build",
          userApiKey: { provider: "claude", apiKey: sensitiveApiKey },
        };

    const result = await callAIAndComment(params);

    // Verify result still returned (error was posted as comment, not thrown)
    expect(result.commentId).toBe(888);

    // Verify postDevFlowComment was called with sanitized error
    const postedComment = vi.mocked(postDevFlowComment).mock.calls[0][3];
    expect(postedComment.content).toContain("AI analysis failed");
    expect(postedComment.content).toContain("[REDACTED]");
    // Critical: API key must NEVER appear in the comment
    expect(postedComment.content).not.toContain(sensitiveApiKey);
    // Error message should still contain the original error context
    expect(postedComment.content).toContain("invalid key");
  });

  it("uses correct emoji and title for each phase", async () => {
    const mockOctokit = createMockOctokit();

    vi.mocked(buildContextForIssue).mockResolvedValue(MOCK_CONTEXT);
    vi.mocked(postDevFlowComment).mockResolvedValue({
          id: 1,
          url: "https://github.com/owner/repo/issues/42#issuecomment-1",
          created: true,
        });

    const phases: Array<{ phase: "inception" | "discussion" | "build" | "review" | "done"; emoji: string; title: string }> = [
          { phase: "inception", emoji: "💡", title: "Inception Analysis" },
          { phase: "discussion", emoji: "💬", title: "Design Discussion" },
          { phase: "build", emoji: "🔨", title: "Build Plan" },
          { phase: "review", emoji: "🔍", title: "Code Review" },
          { phase: "done", emoji: "✅", title: "Release Notes" },
        ];

    for (const { phase, emoji, title } of phases) {
      vi.clearAllMocks();
      vi.mocked(buildContextForIssue).mockResolvedValue(MOCK_CONTEXT);
      vi.mocked(getPromptForPhase).mockReturnValue(MOCK_PROMPT);
      vi.mocked(callAI).mockResolvedValue({
            content: "Result",
            provider: "gemini",
            model: "gemini-2.0-flash",
          });
      vi.mocked(postDevFlowComment).mockResolvedValue({
            id: 1,
            url: "https://github.com/owner/repo/issues/42#issuecomment-1",
            created: true,
          });

      await callAIAndComment({
        octokit: mockOctokit,
        owner: "owner",
        repo: "repo",
        issue: MOCK_ISSUE,
        phase,
        userApiKey: { provider: "gemini", apiKey: "key" },
      });

      const postedComment = vi.mocked(postDevFlowComment).mock.calls[0][3];
      expect(postedComment.content).toContain(`## ${emoji} ${title}`);
    }
  });
});
