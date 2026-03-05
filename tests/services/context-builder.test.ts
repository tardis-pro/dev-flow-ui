import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildContextForIssue } from "@/lib/context-builder";
import type { AuthenticatedOctokit } from "@/lib/github";
import type { ConversationMessage } from "@/lib/prompts/types";
import type { IssueSummary } from "@/lib/types";

// Helper to create mock Octokit
function createMockOctokit(options: {
  fileTree?: Array<{ path: string; type: string }>;
  commits?: Array<{
    sha: string;
    commit: { message: string; author?: { name?: string; date?: string } };
    author?: { login?: string };
  }>;
  prs?: Array<{
    number: number;
    title: string;
    user?: { login?: string };
  }>;
  packageJson?: string | null;
  defaultBranch?: string;
}): AuthenticatedOctokit {
  const getTree = vi.fn().mockResolvedValue({
    data: {
      tree: (options.fileTree ?? []).map((item) => ({
        path: item.path,
        type: item.type,
      })),
    },
  });

  const get = vi.fn().mockResolvedValue({
    data: {
      default_branch: options.defaultBranch ?? "main",
    },
  });

  const listCommits = vi.fn().mockResolvedValue({
    data: options.commits ?? [
      {
        sha: "abc123",
        commit: {
          message: "Initial commit",
          author: { name: "Test User", date: "2024-01-01T00:00:00Z" },
        },
        author: { login: "testuser" },
      },
    ],
  });

  const listPulls = vi.fn().mockResolvedValue({
    data: options.prs ?? [
      {
        number: 1,
        title: "Test PR",
        user: { login: "testuser" },
      },
    ],
  });

  const getContent = vi.fn().mockImplementation(async (params: { path: string }) => {
    if (params.path === "package.json" && options.packageJson !== undefined) {
      if (options.packageJson === null) {
        const error = new Error("Not found");
        (error as unknown as { status: number }).status = 404;
        throw error;
      }
      return {
        data: {
          type: "file",
          content: Buffer.from(options.packageJson).toString("base64"),
        },
      };
    }
    throw new Error(`Unexpected path: ${params.path}`);
  });

  return {
    rest: {
      git: { getTree },
      repos: { get, listCommits, getContent },
      pulls: { list: listPulls },
    },
  } as unknown as AuthenticatedOctokit;
}

const OWNER = "test-owner";
const REPO = "test-repo";

const createMockIssue = (overrides?: Partial<IssueSummary>): IssueSummary =>
  ({
    id: 1,
    number: 42,
    title: "Add authentication feature",
    body: "We need to add OAuth support",
    url: "https://github.com/test-owner/test-repo/issues/42",
    status: "inception",
    workTypes: [],
    assignees: [],
    labels: [{ name: "status:inception" }, { name: "feature" }],
    updatedAt: "2024-01-01T00:00:00Z",
    repository: { owner: OWNER, name: REPO },
    ...overrides,
  });

describe("buildContextForIssue", () => {
  it("returns valid PromptContext with all required fields populated", async () => {
    const octokit = createMockOctokit({
      fileTree: [
        { path: "package.json", type: "blob" },
        { path: "src/index.ts", type: "blob" },
        { path: "lib/auth.ts", type: "blob" },
        { path: "README.md", type: "blob" },
      ],
      packageJson: JSON.stringify({
        dependencies: { react: "18.0.0", next: "14.0.0" },
        devDependencies: { vitest: "1.0.0" },
      }),
    });

    const issue = createMockIssue();
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue);

    expect(result.issue.number).toBe(42);
    expect(result.issue.title).toBe("Add authentication feature");
    expect(result.issue.body).toBe("We need to add OAuth support");
    expect(result.issue.labels).toContain("status:inception");
    expect(result.issue.labels).toContain("feature");

    expect(result.repo.owner).toBe(OWNER);
    expect(result.repo.name).toBe(REPO);
    expect(result.repo.fileTree.length).toBeGreaterThan(0);
    expect(result.repo.stack.language).toBe("TypeScript");
    expect(result.repo.stack.frameworks).toContain("react");
    expect(result.repo.stack.frameworks).toContain("next");
    expect(result.repo.stack.testRunner).toBe("vitest");
    expect(result.repo.recentCommits.length).toBeGreaterThan(0);
    expect(result.repo.openPRs.length).toBeGreaterThan(0);

    expect(result.phase).toBe("inception");
    expect(result.relatedFiles).toBeDefined();
  });

  it("truncates fileTree to 500 max entries", async () => {
    // Create 600 files
    const fileTree = Array.from({ length: 600 }, (_, i) => ({
      path: `src/file${i}.ts`,
      type: "blob",
    }));

    const octokit = createMockOctokit({
      fileTree,
      packageJson: null,
    });

    const issue = createMockIssue();
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue);

    expect(result.repo.fileTree.length).toBeLessThanOrEqual(500);
  });

  it("truncates conversation history to last 15 when > 20 messages", async () => {
    const octokit = createMockOctokit({
      packageJson: null,
    });

    // Create 25 messages
    const conversationHistory: ConversationMessage[] = Array.from(
      { length: 25 },
      (_, i) => ({
        role: i % 2 === 0 ? "user" : "ai",
        content: `Message ${i}`,
        createdAt: new Date(2024, 0, 1, i, 0, 0).toISOString(),
      })
    );

    const issue = createMockIssue();
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue, conversationHistory);

    expect(result.conversationHistory).toBeDefined();
    expect(result.conversationHistory?.length).toBe(15);
    // Verify we got the last 15 messages
    expect(result.conversationHistory?.[0].content).toBe("Message 10");
    expect(result.conversationHistory?.[14].content).toBe("Message 24");
  });

  it("does not truncate conversation history when <= 20 messages", async () => {
    const octokit = createMockOctokit({
      packageJson: null,
    });

    const conversationHistory: ConversationMessage[] = Array.from(
      { length: 15 },
      (_, i) => ({
        role: i % 2 === 0 ? "user" : "ai",
        content: `Message ${i}`,
        createdAt: new Date(2024, 0, 1, i, 0, 0).toISOString(),
      })
    );

    const issue = createMockIssue();
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue, conversationHistory);

    expect(result.conversationHistory?.length).toBe(15);
  });

  it("returns undefined conversationHistory when not provided", async () => {
    const octokit = createMockOctokit({
      packageJson: null,
    });

    const issue = createMockIssue();
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue);

    expect(result.conversationHistory).toBeUndefined();
  });

  it("identifies related files from issue title keywords", async () => {
    const octokit = createMockOctokit({
      fileTree: [
        { path: "lib/auth.ts", type: "blob" },
        { path: "lib/authentication.ts", type: "blob" },
        { path: "src/oauth.ts", type: "blob" },
        { path: "components/Button.tsx", type: "blob" },
        { path: "utils/helpers.ts", type: "blob" },
      ],
      packageJson: null,
    });

    const issue = createMockIssue({ title: "Fix authentication OAuth bug" });
    const result = await buildContextForIssue(octokit, OWNER, REPO, issue);

    expect(result.relatedFiles).toBeDefined();
    // Should find files matching "authentication" or "oauth"
    expect(result.relatedFiles?.length).toBeGreaterThan(0);
  });
});


