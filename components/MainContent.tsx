"use client";

import { useEffect, useState } from "react";
import { Board } from "@/components/Board";
import { Topbar } from "@/components/Topbar";
import { getCustomRepos } from "@/lib/services/custom-repos";
import type { IssueBoardColumn } from "@/lib/types";

type MainContentProps = {
  initialRepoOptions: Array<{ owner: string; repo: string }>;
  initialColumns: IssueBoardColumn[];
  owner?: string;
  repo?: string;
  searchQuery: string;
  initialIssue?: number;
};

export function MainContent({
  initialRepoOptions,
  initialColumns,
  owner,
  repo,
  searchQuery,
  initialIssue,
}: MainContentProps) {
  const [repoOptions, setRepoOptions] = useState(initialRepoOptions);
  const [columns, setColumns] = useState(initialColumns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load custom repos on mount
  useEffect(() => {
    const customRepos = getCustomRepos();
    const merged = [...initialRepoOptions];

    // Add custom repos that aren't already in the list
    for (const customRepo of customRepos) {
      const exists = merged.some(
        (r) => r.owner === customRepo.owner && r.repo === customRepo.name
      );
      if (!exists) {
        merged.push({ owner: customRepo.owner, repo: customRepo.name });
      }
    }

    setRepoOptions(merged);
  }, [initialRepoOptions]);

  // Fetch custom repo issues when a custom repo is selected
  useEffect(() => {
    if (!owner || !repo) return;

    // Check if this is a custom repo
    const isCustomRepo = !initialRepoOptions.some(
      (r) => r.owner === owner && r.repo === repo
    );

    if (isCustomRepo) {
      setLoading(true);
      setError(null);

      fetch(`/api/custom-repo/issues?owner=${owner}&repo=${repo}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch issues");
          return res.json();
        })
        .then((data) => {
          // Map custom repo issues to board columns
          const mappedColumns: IssueBoardColumn[] = [
            { status: "inception", issues: [] },
            { status: "discussion", issues: [] },
            { status: "build", issues: [] },
            { status: "review", issues: [] },
            { status: "done", issues: [] },
          ];

          // Put all issues in inception by default for custom repos
          const mappedIssues = data.issues.map((issue: {
            id: number;
            number: number;
            title: string;
            url: string;
            labels: Array<{ name: string; color?: string }>;
            assignees: Array<{ login: string; avatarUrl: string }>;
            updatedAt: string;
          }) => ({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            url: issue.url,
            status: "inception" as const,
            workTypes: [],
            labels: issue.labels,
            assignees: issue.assignees,
            updatedAt: issue.updatedAt,
            repository: { owner, name: repo },
          }));

          mappedColumns[0].issues = mappedIssues;
          setColumns(mappedColumns);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching custom repo issues:", err);
          setError("Failed to load issues for this repository");
          setLoading(false);
        });
    } else {
      // For authenticated repos, use the initial columns
      setColumns(initialColumns);
    }
  }, [owner, repo, initialRepoOptions, initialColumns]);

  const selectedRepo = owner && repo;

  return (
    <>
      <Topbar
        owner={owner}
        repo={repo}
        repoOptions={repoOptions}
        searchQuery={searchQuery}
      />
      {!selectedRepo ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Connect a repository to your GitHub account or add a custom OSS repository to begin. Once available, pick it in the top bar to load issues.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400 text-center">
          Loading issues...
        </div>
      ) : null}
      {selectedRepo && !loading ? (
        <Board
          initialColumns={columns}
          owner={owner}
          repo={repo}
          initialIssueNumber={initialIssue}
        />
      ) : null}
    </>
  );
}
