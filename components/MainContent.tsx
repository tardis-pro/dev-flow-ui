"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Board } from "@/components/Board";
import { Topbar } from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { getCustomRepos } from "@/lib/services/custom-repos";
import type { IssueBoardColumn } from "@/lib/types";
import { LogOut } from "lucide-react";

type RepoOption = {
  owner: string;
  repo: string;
  description?: string | null;
  language?: string | null;
  stars?: number;
  forks?: number;
  isPrivate?: boolean;
};

type MainContentProps = {
  initialRepoOptions: Array<RepoOption>;
  initialColumns: IssueBoardColumn[];
  owner?: string;
  repo?: string;
  searchQuery: string;
  initialIssue?: number;
  repoMetadata?: RepoOption;
};

export function MainContent({
  initialRepoOptions,
  initialColumns,
  owner,
  repo,
  searchQuery,
  initialIssue,
  repoMetadata,
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Topbar
            owner={owner}
            repo={repo}
            repoOptions={repoOptions}
            searchQuery={searchQuery}
            repoMetadata={repoMetadata}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-full border-slate-700 hover:border-red-500/50 hover:text-red-400"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
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
