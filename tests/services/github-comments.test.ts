import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  postDevFlowComment,
  getDevFlowComments,
  type DevFlowComment,
} from "@/lib/github-comments";
import type { Octokit } from "@octokit/rest";

// Minimal mock Octokit shape
function createMockOctokit(existingComments: Array<{
  id: number;
  body: string;
  html_url: string;
  user: { login: string };
  created_at: string;
}> = []) {
  const listComments = vi.fn().mockResolvedValue({ data: existingComments });
  const createComment = vi.fn().mockResolvedValue({
    data: {
      id: 999,
      html_url: "https://github.com/owner/repo/issues/1#issuecomment-999",
    },
  });

  return {
    rest: {
      issues: {
        listComments,
        createComment,
      },
    },
    _mocks: { listComments, createComment },
  } as unknown as Octokit & { _mocks: { listComments: ReturnType<typeof vi.fn>; createComment: ReturnType<typeof vi.fn> } };
}

const OWNER = "test-owner";
const REPO = "test-repo";

const BASE_COMMENT: DevFlowComment = {
  phase: "build",
  issueNumber: 42,
  content: "DevFlow analysis complete.",
  idempotencyKey: "build-42-1700000000000",
};

describe("postDevFlowComment", () => {
  it("creates a new comment when none with the key exists", async () => {
    const octokit = createMockOctokit([]);
    const result = await postDevFlowComment(octokit, OWNER, REPO, BASE_COMMENT);

    expect(result.created).toBe(true);
    expect(result.id).toBe(999);
    expect((octokit as unknown as { _mocks: { createComment: ReturnType<typeof vi.fn> } })._mocks.createComment).toHaveBeenCalledOnce();

    const callArgs = (octokit as unknown as { _mocks: { createComment: ReturnType<typeof vi.fn> } })._mocks.createComment.mock.calls[0][0];
    expect(callArgs.body).toContain("<!-- devflow:build-42-1700000000000 -->");
    expect(callArgs.body).toContain("DevFlow analysis complete.");
  });

  it("returns existing comment on duplicate call (idempotency)", async () => {
    const marker = "<!-- devflow:build-42-1700000000000 -->";
    const existingBody = `DevFlow analysis complete.\n\n${marker}`;

    const octokit = createMockOctokit([
      {
        id: 101,
        body: existingBody,
        html_url: "https://github.com/owner/repo/issues/42#issuecomment-101",
        user: { login: "devflow-bot" },
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);

    const result = await postDevFlowComment(octokit, OWNER, REPO, BASE_COMMENT);

    expect(result.created).toBe(false);
    expect(result.id).toBe(101);
    expect(result.url).toBe("https://github.com/owner/repo/issues/42#issuecomment-101");
    expect((octokit as unknown as { _mocks: { createComment: ReturnType<typeof vi.fn> } })._mocks.createComment).not.toHaveBeenCalled();
  });

  it("different idempotency keys create separate comments", async () => {
    const existingMarker = "<!-- devflow:build-42-1111111111111 -->";
    const octokit = createMockOctokit([
      {
        id: 201,
        body: `Some content.\n\n${existingMarker}`,
        html_url: "https://github.com/owner/repo/issues/42#issuecomment-201",
        user: { login: "devflow-bot" },
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);

    // Different timestamp = different key
    const newComment: DevFlowComment = {
      ...BASE_COMMENT,
      idempotencyKey: "build-42-2222222222222",
    };

    const result = await postDevFlowComment(octokit, OWNER, REPO, newComment);

    expect(result.created).toBe(true);
    expect((octokit as unknown as { _mocks: { createComment: ReturnType<typeof vi.fn> } })._mocks.createComment).toHaveBeenCalledOnce();
  });
});

describe("getDevFlowComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks DevFlow comments with isDevFlow: true", async () => {
    const marker = "<!-- devflow:review-7-1700000000000 -->";
    const octokit = createMockOctokit([
      {
        id: 301,
        body: `DevFlow review done.\n\n${marker}`,
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-301",
        user: { login: "devflow-bot" },
        created_at: "2024-02-01T00:00:00Z",
      },
      {
        id: 302,
        body: "Just a regular human comment.",
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-302",
        user: { login: "alice" },
        created_at: "2024-02-01T01:00:00Z",
      },
    ]);

    const results = await getDevFlowComments(octokit, OWNER, REPO, 7);

    expect(results).toHaveLength(2);

    const devFlowComment = results.find((c) => c.id === 301);
    expect(devFlowComment?.isDevFlow).toBe(true);
    expect(devFlowComment?.phase).toBe("review");
    expect(devFlowComment?.author).toBe("devflow-bot");

    const regularComment = results.find((c) => c.id === 302);
    expect(regularComment?.isDevFlow).toBe(false);
    expect(regularComment?.phase).toBeUndefined();
    expect(regularComment?.author).toBe("alice");
  });

  it("extracts correct phase from idempotency key", async () => {
    const phases = ["inception", "discussion", "build", "review", "done"] as const;

    for (const phase of phases) {
      const marker = `<!-- devflow:${phase}-10-1700000000000 -->`;
      const octokit = createMockOctokit([
        {
          id: 400,
          body: `Content.\n\n${marker}`,
          html_url: "https://github.com/owner/repo/issues/10#issuecomment-400",
          user: { login: "bot" },
          created_at: "2024-03-01T00:00:00Z",
        },
      ]);

      const results = await getDevFlowComments(octokit, OWNER, REPO, 10);
      expect(results[0].phase).toBe(phase);
    }
  });

  it("returns empty array when no comments exist", async () => {
    const octokit = createMockOctokit([]);
    const results = await getDevFlowComments(octokit, OWNER, REPO, 99);
    expect(results).toHaveLength(0);
  });

  it("handles comment with no body gracefully", async () => {
    // Simulate a comment with undefined body
    const mockOctokit = {
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: [
              {
                id: 500,
                body: undefined,
                html_url: "https://github.com/owner/repo/issues/1#issuecomment-500",
                user: { login: "ghost" },
                created_at: "2024-04-01T00:00:00Z",
              },
            ],
          }),
          createComment: vi.fn(),
        },
      },
    } as unknown as Octokit;

    const results = await getDevFlowComments(mockOctokit, OWNER, REPO, 1);
    expect(results[0].isDevFlow).toBe(false);
    expect(results[0].body).toBe("");
  });
});
