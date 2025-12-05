"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type AddRepoDialogProps = {
  onRepoAdded?: (repo: { owner: string; name: string }) => void;
};

export function AddRepoDialog({ onRepoAdded }: AddRepoDialogProps) {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    // Support various GitHub URL formats
    const patterns = [
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
      /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.trim().match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
      }
    }

    return null;
  };

  const validateRepo = async (owner: string, repo: string): Promise<boolean> => {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      return response.ok;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const parsed = parseGitHubUrl(repoUrl);

      if (!parsed) {
        setError("Invalid GitHub repository URL or format");
        setLoading(false);
        return;
      }

      const { owner, repo } = parsed;

      // Validate the repository exists
      const isValid = await validateRepo(owner, repo);

      if (!isValid) {
        setError("Repository not found or not accessible");
        setLoading(false);
        return;
      }

      // Store in localStorage
      const storageKey = "custom_repositories";
      const stored = localStorage.getItem(storageKey);
      const existingRepos = stored ? JSON.parse(stored) : [];

      // Check if already added
      const repoKey = `${owner}/${repo}`;
      const alreadyExists = existingRepos.some(
        (r: { owner: string; name: string }) => `${r.owner}/${r.name}` === repoKey
      );

      if (alreadyExists) {
        setError("This repository is already added");
        setLoading(false);
        return;
      }

      // Add to list
      const newRepo = { owner, name: repo };
      existingRepos.push(newRepo);
      localStorage.setItem(storageKey, JSON.stringify(existingRepos));

      toast.success(`Added ${owner}/${repo} successfully!`);

      // Notify parent component
      onRepoAdded?.(newRepo);

      // Reset and close
      setRepoUrl("");
      setOpen(false);
    } catch (err) {
      setError("Failed to add repository. Please try again.");
      console.error("Error adding repository:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="
            group relative gap-2 rounded-full overflow-hidden
            bg-slate-900/80 backdrop-blur-xl
            border border-slate-700/50
            hover:border-purple-500/50
            transition-all duration-300
            shadow-lg hover:shadow-purple-500/20
          "
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Plus className="relative h-4 w-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
          <span className="relative text-sm font-semibold">
            Add OSS Repo
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-900/95 backdrop-blur-2xl border-slate-700/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-100">
            Add OSS Repository
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Add any public GitHub repository to track its issues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="repo-url" className="text-slate-300">
                Repository URL or path
              </Label>
              <Input
                id="repo-url"
                placeholder="e.g., facebook/react or https://github.com/facebook/react"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setError("");
                }}
                className="bg-slate-800/50 border-slate-700/50 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20"
                disabled={loading}
              />
              <p className="text-xs text-slate-500">
                Supported formats: owner/repo, https://github.com/owner/repo, git@github.com:owner/repo.git
              </p>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setRepoUrl("");
                setError("");
              }}
              disabled={loading}
              className="border-slate-700/50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !repoUrl.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Adding..." : "Add Repository"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
