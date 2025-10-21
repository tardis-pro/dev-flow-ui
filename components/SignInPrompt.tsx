"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInPrompt() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-800/70 bg-slate-950/70 p-12 text-center">
      <h2 className="text-xl font-semibold text-slate-100">Sign in to GitHub</h2>
      <p className="max-w-sm text-sm text-slate-400">
        Authenticate with GitHub to load Navratna issues, artifacts, and run Gemini orchestration.
      </p>
      <Button onClick={() => signIn("github")}>Sign in with GitHub</Button>
    </div>
  );
}
