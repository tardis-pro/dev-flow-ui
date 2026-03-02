import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next-auth before importing the route
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/github", () => ({
  createUserClient: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    getUserByGithubId: vi.fn(async () => null),
    updateUserRepoBootstrapped: vi.fn(async () => {}),
  })),
}));

import { getServerSession } from "next-auth";
import { createUserClient } from "@/lib/github";
import { POST } from "@/app/api/bootstrap/route";

const MOCK_SESSION = {
  accessToken: "gho_test_token",
  user: { id: "123", name: "Test User", email: "test@example.com" },
};

function createMockOctokit(opts: {
  labelCreateShouldFail?: boolean;
  workflowExists?: boolean;
  prExists?: boolean;
} = {}) {
  const createLabel = vi.fn(async () => ({ data: {} }));
  if (opts.labelCreateShouldFail) {
    createLabel.mockRejectedValue(Object.assign(new Error("Label already exists"), { status: 422 }));
  }

  const getContent = vi.fn(async () => {
    if (opts.workflowExists) return { data: {} };
    const err = Object.assign(new Error("Not Found"), { status: 404 });
    throw err;
  });

  const get = vi.fn(async () => ({ data: { default_branch: "main" } }));
  const getRef = vi.fn(async () => ({ data: { object: { sha: "abc123sha" } } }));
  const createRef = vi.fn(async () => ({ data: {} }));
  const createOrUpdateFileContents = vi.fn(async () => ({ data: {} }));

  const existingPRs = opts.prExists
    ? [{ html_url: "https://github.com/owner/repo/pull/1" }]
    : [];
  const listPulls = vi.fn(async () => ({ data: existingPRs }));
  const createPull = vi.fn(async () => ({
    data: { html_url: "https://github.com/owner/repo/pull/2" },
  }));

  return {
    rest: {
      issues: { createLabel },
      repos: { get, getContent, createOrUpdateFileContents },
      git: { getRef, createRef },
      pulls: { list: listPulls, create: createPull },
    },
  };
}

describe("Bootstrap Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(MOCK_SESSION);
  });

  it("first bootstrap call creates all labels and a PR", async () => {
    const mockOctokit = createMockOctokit();
    vi.mocked(createUserClient).mockResolvedValue(mockOctokit as never);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.labels_created).toBe(10);
    expect(data.labels_skipped).toBe(0);
    expect(data.pr_url).toBeDefined();
    expect(data.already_bootstrapped).toBe(false);
  });

  it("second bootstrap call with existing labels skips them gracefully (422 → skipped)", async () => {
    const mockOctokit = createMockOctokit({ labelCreateShouldFail: true });
    vi.mocked(createUserClient).mockResolvedValue(mockOctokit as never);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.labels_created).toBe(0);
    expect(data.labels_skipped).toBe(10);
    expect(data.already_bootstrapped).toBe(false);
  });

  it("bootstrap with workflow file already existing returns already_bootstrapped=true", async () => {
    const mockOctokit = createMockOctokit({ workflowExists: true });
    vi.mocked(createUserClient).mockResolvedValue(mockOctokit as never);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.already_bootstrapped).toBe(true);
    // No PR should be created since workflow already exists
    expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it("bootstrap with existing open PR reuses it instead of creating a new one", async () => {
    const mockOctokit = createMockOctokit({ prExists: true });
    vi.mocked(createUserClient).mockResolvedValue(mockOctokit as never);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.pr_url).toBe("https://github.com/owner/repo/pull/1");
    // Should NOT create a new PR since one already exists
    expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when owner or repo is missing", async () => {
    const mockOctokit = createMockOctokit();
    vi.mocked(createUserClient).mockResolvedValue(mockOctokit as never);

    const request = new Request("http://localhost:3000/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "test-owner" }), // missing repo
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });
});
