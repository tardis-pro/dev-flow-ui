"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RepoPicker } from "@/components/RepoPicker";
import { AddRepoDialog } from "@/components/AddRepoDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus } from "lucide-react";

type TopbarProps = {
  owner?: string;
  repo?: string;
  repoOptions: Array<{ owner: string; repo: string }>;
  searchQuery?: string;
  onCreateIssue?: () => void;
};

export function Topbar({
  owner,
  repo,
  repoOptions,
  searchQuery = "",
  onCreateIssue,
}: TopbarProps) {
  const [value, setValue] = useState(searchQuery);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    setValue(searchQuery);
  }, [searchQuery]);

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

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
      <div className="flex flex-wrap items-center gap-3">
        <RepoPicker
          value={owner && repo ? { owner, repo } : undefined}
          options={repoOptions}
          onChange={handleRepoChange}
        />
        <AddRepoDialog onRepoAdded={handleRepoAdded} />
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Search issues, labels, or assignees"
            value={value}
            onChange={(event) => {
              const query = event.target.value;
              setValue(query);
              const next = new URLSearchParams(params?.toString() ?? "");
              if (query) {
                next.set("q", query);
              } else {
                next.delete("q");
              }
              updateQuery(next);
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
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <Badge variant="outline" className="gap-2">
          <Filter className="h-3 w-3" /> Quick filters coming soon
        </Badge>
        <span>Filter by status, work-type, or assignee to focus the board.</span>
      </div>
    </div>
  );
}
