import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Missing owner or repo parameter" },
        { status: 400 }
      );
    }

    // Use unauthenticated Octokit for public repos
    const octokit = new Octokit();

    // Fetch repository information
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo,
    });

    // Fetch open issues
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 100,
    });

    // Filter out pull requests
    const filteredIssues = issues.filter((issue) => !issue.pull_request);

    // Map to simplified format
    const mappedIssues = filteredIssues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      labels: issue.labels.map((label) => ({
        name: typeof label === "string" ? label : label.name ?? "",
        color: typeof label === "string" ? undefined : label.color,
      })),
      assignees: (issue.assignees ?? []).map((assignee) => ({
        login: assignee.login,
        avatarUrl: assignee.avatar_url,
      })),
      updatedAt: issue.updated_at,
      createdAt: issue.created_at,
      state: issue.state,
      comments: issue.comments,
    }));

    return NextResponse.json({
      repository: {
        owner: repoData.owner.login,
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        language: repoData.language,
        isPrivate: repoData.private,
        updatedAt: repoData.updated_at,
      },
      issues: mappedIssues,
      totalCount: filteredIssues.length,
    });
  } catch (error: unknown) {
    console.error("Error fetching custom repo issues:", error);

    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        return NextResponse.json(
          { error: "Repository not found" },
          { status: 404 }
        );
      }
      if (status === 403) {
        return NextResponse.json(
          { error: "Rate limit exceeded or access forbidden" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch repository issues" },
      { status: 500 }
    );
  }
}
