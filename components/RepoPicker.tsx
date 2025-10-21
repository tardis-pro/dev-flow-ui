"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitBranch } from "lucide-react";

type RepoPickerProps = {
  value: { owner: string; repo: string };
  options: Array<{ owner: string; repo: string }>;
  onChange?: (value: { owner: string; repo: string }) => void;
};

export function RepoPicker({ value, options, onChange }: RepoPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-full border-slate-700 bg-slate-900"
        >
          <GitBranch className="h-4 w-4" />
          <span className="text-sm font-semibold">{value.owner}/{value.repo}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[220px]">
        <DropdownMenuLabel>Repositories</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={`${option.owner}/${option.repo}`}
            onSelect={() => onChange?.(option)}
            className="flex items-center gap-2"
          >
            <GitBranch className="h-3.5 w-3.5 text-slate-500" />
            <span>{option.owner}/{option.repo}</span>
          </DropdownMenuItem>
        ))}
        {!options.length ? (
          <DropdownMenuItem disabled>No repositories configured</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
