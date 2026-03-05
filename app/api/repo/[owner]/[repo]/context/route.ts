import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createUserClient } from "@/lib/github";
import type { RepoStack, RecentCommit } from "@/lib/prompts/types";

export const runtime = "nodejs";

type OpenPR = {
  number: number;
  title: string;
  author: string;
};

type RepoContextResponse = {
  fileTree: string[];
  stack: RepoStack;
  recentCommits: RecentCommit[];
  openPRs: OpenPR[];
};

function isGitHubError(error: unknown): error is { status: number } {
  return typeof error === "object" && error !== null && "status" in error;
}

// Detect package manager from lock files
function detectPackageManager(rootFiles: string[]): string | undefined {
  if (rootFiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (rootFiles.includes("bun.lock")) return "bun";
  if (rootFiles.includes("yarn.lock")) return "yarn";
  if (rootFiles.includes("package-lock.json")) return "npm";
  return undefined;
}

// Detect language from manifest files
function detectLanguage(rootFiles: string[]): string | undefined {
  if (rootFiles.includes("package.json")) return "JavaScript";
  if (rootFiles.includes("Cargo.toml")) return "Rust";
  if (rootFiles.includes("go.mod")) return "Go";
  if (rootFiles.includes("requirements.txt") || rootFiles.includes("pyproject.toml")) return "Python";
  if (rootFiles.includes("pom.xml")) return "Java";
  if (rootFiles.includes("build.gradle") || rootFiles.includes("build.gradle.kts")) return "Java";
  if (rootFiles.includes("Gemfile")) return "Ruby";
  if (rootFiles.includes("composer.json")) return "PHP";
  return undefined;
}

// Parse package.json to extract frameworks, test runners, build tools
function parsePackageJsonDeps(packageJsonContent: string): {
  frameworks: string[];
  testRunner?: string;
  buildTool?: string;
} {
  const frameworks: string[] = [];
  let testRunner: string | undefined;
  let buildTool: string | undefined;

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(packageJsonContent);
  } catch {
    return { frameworks, testRunner, buildTool };
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Frameworks
  if (allDeps["react"] || allDeps["react-dom"]) frameworks.push("react");
  if (allDeps["next"]) frameworks.push("next");
  if (allDeps["vue"]) frameworks.push("vue");
  if (allDeps["angular"] || allDeps["@angular/core"]) frameworks.push("angular");
  if (allDeps["express"]) frameworks.push("express");
  if (allDeps["fastify"]) frameworks.push("fastify");
  if (allDeps["hono"]) frameworks.push("hono");
  if (allDeps["svelte"]) frameworks.push("svelte");
  if (allDeps["astro"]) frameworks.push("astro");

  // Test runners (priority: first match wins)
  if (allDeps["vitest"]) testRunner = "vitest";
  else if (allDeps["jest"]) testRunner = "jest";
  else if (allDeps["mocha"]) testRunner = "mocha";
  else if (allDeps["jasmine"]) testRunner = "jasmine";

  // Build tools (priority: first match wins)
  if (allDeps["vite"]) buildTool = "vite";
  else if (allDeps["webpack"]) buildTool = "webpack";
  else if (allDeps["esbuild"]) buildTool = "esbuild";
  else if (allDeps["rollup"]) buildTool = "rollup";
  else if (allDeps["turbo"]) buildTool = "turbo";

  return { frameworks, testRunner, buildTool };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo } = await params;

    // Create octokit with user's OAuth token
    const octokit = await createUserClient();

    // Verify repo exists and get default branch
    let defaultBranch: string;
    try {
      const repoData = await octokit.repos.get({ owner, repo });
      defaultBranch = repoData.data.default_branch;
    } catch (error: unknown) {
      if (isGitHubError(error) && error.status === 404) {
        return NextResponse.json({ error: "Repository not found" }, { status: 404 });
      }
      throw error;
    }

    // Fetch file tree (2 levels max)
    const fileTree: string[] = [];

    // Level 1: Get root tree
    const rootTree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: "false",
    });

    const rootFiles: string[] = [];
    const directories: string[] = [];

    for (const item of rootTree.data.tree) {
      if (item.type === "tree") {
        directories.push(item.path);
        fileTree.push(`${item.path}/`);
      } else {
        rootFiles.push(item.path);
        fileTree.push(item.path);
      }
    }

    // Level 2: Fetch contents of directories (one level deeper)
    await Promise.all(
      directories.map(async (dir) => {
        try {
          const subTree = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: `${defaultBranch}:${dir}`,
            recursive: "false",
          });
          for (const item of subTree.data.tree) {
            fileTree.push(`${dir}/${item.path}`);
          }
        } catch {
          // Ignore errors for individual directories
        }
      }),
    );

    // Detect stack
    const stack: RepoStack = {
      language: detectLanguage(rootFiles),
      packageManager: detectPackageManager(rootFiles),
      frameworks: [],
    };

    // Parse package.json if it exists
    if (rootFiles.includes("package.json")) {
      try {
        const pkgContent = await octokit.repos.getContent({
          owner,
          repo,
          path: "package.json",
          ref: defaultBranch,
        });

        if (!Array.isArray(pkgContent.data) && pkgContent.data.type === "file") {
          const content = "content" in pkgContent.data ? pkgContent.data.content : "";
          const decoded = Buffer.from(content, "base64").toString("utf8");
          const parsed = parsePackageJsonDeps(decoded);
          stack.frameworks = parsed.frameworks;
          stack.testRunner = parsed.testRunner;
          stack.buildTool = parsed.buildTool;
        }
      } catch {
        // Ignore package.json parse errors
      }
    }

    // Fetch recent commits (last 10)
    const commitsResponse = await octokit.repos.listCommits({
      owner,
      repo,
      sha: defaultBranch,
      per_page: 10,
    });

    const recentCommits: RecentCommit[] = commitsResponse.data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message.split("\n")[0] ?? "", // First line only
      author: commit.commit.author?.name ?? commit.author?.login ?? "Unknown",
      date: commit.commit.author?.date ?? "",
    }));

    // Fetch open PRs (5)
    const prsResponse = await octokit.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 5,
      sort: "updated",
      direction: "desc",
    });

    const openPRs: OpenPR[] = prsResponse.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "Unknown",
    }));

    const response: RepoContextResponse = {
      fileTree,
      stack,
      recentCommits,
      openPRs,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to fetch repo context:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository context" },
      { status: 500 },
    );
  }
}
