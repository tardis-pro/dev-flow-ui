"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { RepoPicker } from "@/components/RepoPicker";
import { AddRepoDialog } from "@/components/AddRepoDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Plus, RefreshCw, X, User, Tag, GitPullRequest } from "lucide-react";
import { ISSUE_STATUSES, WORK_TYPE_LABELS } from "@/lib/labels";
import type { IssueStatus, WorkType } from "@/lib/labels";

type RepoOption = {
  owner: string;
  repo: string;
  description?: string | null;
  language?: string | null;
  stars?: number;
  forks?: number;
  isPrivate?: boolean;
};

type TopbarProps = {
  owner?: string;
  repo?: string;
  repoOptions: Array<RepoOption>;
  searchQuery?: string;
  onCreateIssue?: () => void;
  repoMetadata?: RepoOption;
};

export function Topbar({
  owner,
  repo,
  repoOptions,
  searchQuery = "",
  onCreateIssue,
  repoMetadata,
}: TopbarProps) {
  const [value, setValue] = useState(searchQuery);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  // Filter states
  const [selectedStatuses, setSelectedStatuses] = useState<IssueStatus[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<WorkType[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");

  // Parse filters from URL
  useEffect(() => {
    const statusParam = params?.get("status");
    const workTypeParam = params?.get("workType");
    const assigneeParam = params?.get("assignee");

    if (statusParam) {
      setSelectedStatuses(statusParam.split(",") as IssueStatus[]);
    } else {
      setSelectedStatuses([]);
    }

    if (workTypeParam) {
      setSelectedWorkTypes(workTypeParam.split(",") as WorkType[]);
    } else {
      setSelectedWorkTypes([]);
    }

    setSelectedAssignee(assigneeParam || "");
  }, [params]);

  useEffect(() => {
    setValue(searchQuery);
  }, [searchQuery]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  function updateQuery(next: URLSearchParams) {
    router.replace(`${pathname}?${next.toString()}`);
  }

  function handleRepoChange(selection: { owner: string; repo: string }) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("owner", selection.owner);
    next.set("repo", selection.repo);
    next.delete("issue");
    updateQuery(next);
  }

  function handleRepoAdded(repo: { owner: string; name: string }) {
    handleRepoChange({ owner: repo.owner, repo: repo.name });
  }

  const handleReauthorize = () => {
    // Trigger GitHub OAuth with prompt=consent to force re-authorization
    signIn("github", {
      callbackUrl: window.location.href,
      redirect: true
    });
  };

  const toggleStatus = (status: IssueStatus) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter((s) => s !== status)
      : [...selectedStatuses, status];

    setSelectedStatuses(newStatuses);
    const next = new URLSearchParams(params?.toString() ?? "");
    if (newStatuses.length > 0) {
      next.set("status", newStatuses.join(","));
    } else {
      next.delete("status");
    }
    updateQuery(next);
  };

  const toggleWorkType = (workType: WorkType) => {
    const newWorkTypes = selectedWorkTypes.includes(workType)
      ? selectedWorkTypes.filter((w) => w !== workType)
      : [...selectedWorkTypes, workType];

    setSelectedWorkTypes(newWorkTypes);
    const next = new URLSearchParams(params?.toString() ?? "");
    if (newWorkTypes.length > 0) {
      next.set("workType", newWorkTypes.join(","));
    } else {
      next.delete("workType");
    }
    updateQuery(next);
  };

  const clearAllFilters = () => {
    setSelectedStatuses([]);
    setSelectedWorkTypes([]);
    setSelectedAssignee("");
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete("status");
    next.delete("workType");
    next.delete("assignee");
    updateQuery(next);
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedWorkTypes.length > 0 || selectedAssignee;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
      <div className="flex flex-wrap items-center gap-3">
        <RepoPicker
          value={owner && repo ? { owner, repo } : undefined}
          options={repoOptions}
          onChange={handleRepoChange}
        />
        <AddRepoDialog onRepoAdded={handleRepoAdded} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleReauthorize}
          className="rounded-full border-slate-700 hover:border-cyan-500/50"
          title="Re-authorize GitHub to update permissions (e.g., add org access)"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Update Permissions
        </Button>
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Search issues, labels, or assignees"
            value={value}
            onChange={(event) => {
              const query = event.target.value;
              setValue(query);

              // Clear existing timer
              if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
              }

              // Set new timer (300ms debounce)
              debounceTimerRef.current = setTimeout(() => {
                const next = new URLSearchParams(params?.toString() ?? "");
                if (query) {
                  next.set("q", query);
                } else {
                  next.delete("q");
                }
                updateQuery(next);
              }, 300);
            }}
            className="rounded-full border-slate-700 bg-slate-900 pl-4"
          />
        </div>
        <Button
          variant="default"
          className="rounded-full"
          disabled={!owner || !repo}
          onClick={() => {
            if (!owner || !repo) return;
            if (onCreateIssue) {
              onCreateIssue();
              return;
            }
            const url = `https://github.com/${owner}/${repo}/issues/new`;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New Issue
        </Button>
      </div>
      {/* Quick Filters & Repo Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-2 rounded-full border-slate-700">
                <GitPullRequest className="h-3 w-3" />
                <span className="text-xs">Status</span>
                {selectedStatuses.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-cyan-500/20 text-cyan-300">
                    {selectedStatuses.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ISSUE_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={selectedStatuses.includes(status)}
                  onCheckedChange={() => toggleStatus(status)}
                  className="capitalize"
                >
                  {status}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Work Type Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-2 rounded-full border-slate-700">
                <Tag className="h-3 w-3" />
                <span className="text-xs">Work Type</span>
                {selectedWorkTypes.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-300">
                    {selectedWorkTypes.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Filter by Work Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {WORK_TYPE_LABELS.map((workType) => (
                <DropdownMenuCheckboxItem
                  key={workType}
                  checked={selectedWorkTypes.includes(workType)}
                  onCheckedChange={() => toggleWorkType(workType)}
                  className="capitalize"
                >
                  {workType}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-7 gap-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
              Clear Filters
            </Button>
          )}
        </div>

        {/* Repository Metadata */}
        {repoMetadata && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {repoMetadata.language && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                {repoMetadata.language}
              </span>
            )}
            {repoMetadata.stars !== undefined && (
              <span className="flex items-center gap-1">
                ⭐ {repoMetadata.stars.toLocaleString()}
              </span>
            )}
            {repoMetadata.forks !== undefined && (
              <span className="flex items-center gap-1">
                🔱 {repoMetadata.forks.toLocaleString()}
              </span>
            )}
            {repoMetadata.isPrivate && (
              <Badge variant="outline" className="h-5 text-[10px] border-yellow-500/50 text-yellow-400">
                Private
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
