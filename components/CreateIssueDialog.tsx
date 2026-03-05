"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { WORK_TYPE_LABELS, type WorkType } from "@/lib/labels";

type Props = {
  open: boolean;
  owner: string;
  repo: string;
  onClose: () => void;
  onCreated: (issue: { number: number; title: string; url: string }) => void;
};

export function CreateIssueDialog({ open, owner, repo, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [workType, setWorkType] = useState<WorkType | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setBody("");
    setWorkType("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    const labels = ["status:inception"];
    if (workType) labels.push(workType);

    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, title: title.trim(), body, labels }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create issue");
        return;
      }

      const issue = await res.json();
      reset();
      onCreated(issue);
    } catch {
      setError("Failed to create issue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-100">New Issue</DialogTitle>
          <p className="text-xs text-slate-500">{owner}/{repo}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, descriptive title"
              className="border-slate-700 bg-slate-900"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-body">Description <span className="text-slate-500">(optional)</span></Label>
            <textarea
              id="issue-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What needs to be done?"
              rows={4}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="work-type">Work type <span className="text-slate-500">(optional)</span></Label>
            <select
              id="work-type"
              value={workType}
              onChange={(e) => setWorkType(e.target.value as WorkType | "")}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">— none —</option>
              {WORK_TYPE_LABELS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
