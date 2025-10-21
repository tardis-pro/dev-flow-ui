"use client";

import { useState } from "react";
import { RepoPicker } from "@/components/RepoPicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus } from "lucide-react";

type TopbarProps = {
  owner: string;
  repo: string;
  repoOptions: Array<{ owner: string; repo: string }>;
  onRepoChange?: (value: { owner: string; repo: string }) => void;
  onSearch?: (query: string) => void;
  onCreateIssue?: () => void;
};

export function Topbar({
  owner,
  repo,
  repoOptions,
  onRepoChange,
  onSearch,
  onCreateIssue,
}: TopbarProps) {
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
      <div className="flex flex-wrap items-center gap-3">
        <RepoPicker
          value={{ owner, repo }}
          options={repoOptions}
          onChange={onRepoChange}
        />
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Search issues, labels, or assignees"
            value={value}
            onChange={(event) => {
              const query = event.target.value;
              setValue(query);
              onSearch?.(query);
            }}
            className="rounded-full border-slate-700 bg-slate-900 pl-4"
          />
        </div>
        <Button
          variant="default"
          className="rounded-full"
          onClick={onCreateIssue}
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
