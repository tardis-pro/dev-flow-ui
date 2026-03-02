import type { AuthenticatedOctokit } from "@/lib/github";
import type { IssueSummary } from "@/lib/types";
import type {
  PromptContext,
  RepoContext,
  RepoStack,
  ConversationMessage,
  RecentCommit,
} from "@/lib/prompts/types";
import type { IssueStatus } from "@/lib/labels";

const MAX_FILE_TREE_SIZE = 500;
const MAX_CONVERSATION_HISTORY = 15;
const CONVERSATION_TRUNCATION_THRESHOLD = 20;

type ApiError = { status?: number };

function isGitHubError(error: unknown): error is ApiError {
  return typeof error === "object" && error !== null && "status" in error;
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(rootFiles: string[]): string | undefined {
  if (rootFiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (rootFiles.includes("bun.lock")) return "bun";
  if (rootFiles.includes("yarn.lock")) return "yarn";
  if (rootFiles.includes("package-lock.json")) return "npm";
  return undefined;
}

/**
 * Detect language from file extensions in tree
 */
function detectLanguageFromTree(fileTree: string[]): string | undefined {
  const extensionCounts: Record<string, number> = {};

  for (const path of fileTree) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext && ext.length <= 4) {
      extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
    }
  }

  // Map extensions to languages
  const extensionToLanguage: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    go: "Go",
    rs: "Rust",
    java: "Java",
    kt: "Kotlin",
    rb: "Ruby",
    php: "PHP",
  };

  let maxCount = 0;
  let detectedLanguage: string | undefined;

  for (const [ext, count] of Object.entries(extensionCounts)) {
    // Skip config-like extensions
    if (["json", "yaml", "yml", "md", "txt", "toml"].includes(ext)) continue;
    if (count > maxCount && extensionToLanguage[ext]) {
      maxCount = count;
      detectedLanguage = extensionToLanguage[ext];
    }
  }

  return detectedLanguage;
}

/**
 * Parse package.json to extract frameworks, test runners, build tools
 */
function parsePackageJsonDeps(
  packageJsonContent: string,
): { frameworks: string[]; testRunner?: string; buildTool?: string } {
  const frameworks: string[] = [];
  let testRunner: string | undefined;
  let buildTool: string | undefined;

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
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

/**
 * Identify related files by matching issue title keywords against file tree paths
 */
function identifyRelatedFiles(
  issueTitle: string,
  fileTree: string[],
  maxFiles: number = 10,
): string[] {
  // Extract keywords from issue title (> 3 chars)
  const keywords = issueTitle
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const relatedFiles: string[] = [];

  for (const path of fileTree) {
    if (relatedFiles.length >= maxFiles) break;

    const pathLower = path.toLowerCase();
    for (const keyword of keywords) {
      if (pathLower.includes(keyword)) {
        relatedFiles.push(path);
        break; // Only match each file once
      }
    }
  }

  return relatedFiles;
}

/**
 * Truncate conversation history to last N messages if exceeds threshold
 */
function truncateConversationHistory(
  history: ConversationMessage[] | undefined,
): ConversationMessage[] | undefined {
  if (!history || history.length <= CONVERSATION_TRUNCATION_THRESHOLD) {
    return history;
  }
  return history.slice(-MAX_CONVERSATION_HISTORY);
}

/**
 * Extract label names from IssueSummary.labels array
 */
function extractLabelNames(
  labels: IssueSummary["labels"],
): string[] {
  return labels.map((label) => label.name);
}

/**
 * Fetch repo context (file tree, stack, recent commits, open PRs)
 * This function fetches all the data needed for PromptContext.repo
 */
async function fetchRepoContext(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
): Promise<RepoContext> {
  // Get default branch first
  let defaultBranch: string;
  try {
    const repoData = await octokit.rest.repos.get({ owner, repo });
    defaultBranch = repoData.data.default_branch;
  } catch (error: unknown) {
    if (isGitHubError(error) && error.status === 404) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }
    throw error;
  }

  // Fetch file tree recursively
  const treeResponse = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: "HEAD",
    recursive: "1",
  });

  // Extract all file paths (filter to files only, type === 'blob')
  let fileTree = treeResponse.data.tree
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path as string);

  // Truncate to max size
  if (fileTree.length > MAX_FILE_TREE_SIZE) {
    fileTree = fileTree.slice(0, MAX_FILE_TREE_SIZE);
  }

  // Get root files for stack detection
  const rootFiles = fileTree
    .filter((path) => !path.includes("/"))
    .map((path) => path.split("/").pop() ?? path);

  // Build stack
  const stack: RepoStack = {
    language: detectLanguageFromTree(fileTree),
    packageManager: detectPackageManager(rootFiles),
    frameworks: [],
  };

  // Parse package.json if it exists
  const packageJsonPath = "package.json";
  if (rootFiles.includes(packageJsonPath)) {
    try {
      const pkgContent = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: packageJsonPath,
        ref: defaultBranch,
      });

      if (
        !Array.isArray(pkgContent.data) &&
        pkgContent.data.type === "file"
      ) {
        const content =
          "content" in pkgContent.data ? pkgContent.data.content : "";
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
  const commitsResponse = await octokit.rest.repos.listCommits({
    owner,
    repo,
    per_page: 10,
  });

  const recentCommits: RecentCommit[] = commitsResponse.data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message.split("\n")[0] ?? "",
    author: commit.commit.author?.name ?? commit.author?.login ?? "Unknown",
    date: commit.commit.author?.date ?? "",
  }));

  // Fetch open PRs (5)
  const prsResponse = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 5,
    sort: "updated",
    direction: "desc",
  });

  const openPRs = prsResponse.data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "Unknown",
  }));

  return {
    fileTree,
    stack,
    recentCommits,
    openPRs,
  };
}

/**
 * Build the full PromptContext for an issue.
 * This is the main entry point for assembling AI prompt context.
 */
export async function buildContextForIssue(
  octokit: AuthenticatedOctokit,
  owner: string,
  repo: string,
  issue: IssueSummary,
  conversationHistory?: ConversationMessage[],
): Promise<PromptContext> {
  // Fetch repo context
  const repoContext = await fetchRepoContext(octokit, owner, repo);

  // Extract label names
  const labelNames = extractLabelNames(issue.labels);

  // Identify related files (for inception phase)
  const relatedFiles = identifyRelatedFiles(issue.title, repoContext.fileTree);

  // Truncate conversation history if needed
  const truncatedHistory = truncateConversationHistory(conversationHistory);

  // Build and return PromptContext
  return {
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: labelNames,
    },
    repo: {
      owner,
      name: repo,
      ...repoContext,
    },
    conversationHistory: truncatedHistory,
    phase: issue.status,
    relatedFiles,
  };
}
