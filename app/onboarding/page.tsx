"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/lib/stores/onboarding-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, GitBranch, Key, Rocket, Loader2, Check, AlertTriangle } from "lucide-react";

export const runtime = "nodejs";

type Repo = {
  owner: string;
  name: string;
  description?: string | null;
  language?: string | null;
  isPrivate?: boolean;
};

type BootstrapResult = {
  labels_created: number;
  labels_skipped: number;
  pr_url?: string;
  already_bootstrapped: boolean;
};

type ValidationState = "idle" | "validating" | "valid" | "error";

export default function OnboardingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { step, selectedRepos, setStep, addRepo, removeRepo, completeOnboarding } = useOnboardingStore();

  // Step 2: repos
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  // Step 3: bootstrap
  const [bootstrapResults, setBootstrapResults] = useState<Record<string, BootstrapResult | null>>({});
  const [bootstrapLoading, setBootstrapLoading] = useState<Record<string, boolean>>({});

  // Step 4: AI keys
  const [provider, setProvider] = useState<"gemini" | "claude" | "qwen">("gemini");
  const [apiKey, setApiKey] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [validationMessage, setValidationMessage] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (step === "repo_selected") {
      loadRepos();
    }
  }, [step]);

  const loadRepos = async () => {
    setReposLoading(true);
    try {
      const res = await fetch("/api/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(Array.isArray(data) ? data : data.repos ?? []);
      }
    } catch {
      // ignore
    } finally {
      setReposLoading(false);
    }
  };

  const handleBootstrap = async (owner: string, repo: string) => {
    const key = `${owner}/${repo}`;
    setBootstrapLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      if (res.ok) {
        const data: BootstrapResult = await res.json();
        setBootstrapResults((prev) => ({ ...prev, [key]: data }));
      }
    } catch {
      // ignore
    } finally {
      setBootstrapLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleValidate = async () => {
    if (!apiKey.trim()) {
      setValidationState("error");
      setValidationMessage("API key cannot be empty");
      return;
    }
    setValidationState("validating");
    setValidationMessage("Validating...");
    try {
      const res = await fetch("/api/user/keys/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      if (data.valid) {
        setValidationState("valid");
        setValidationMessage(`Valid ${provider} API key`);
      } else {
        setValidationState("error");
        setValidationMessage(data.error ?? "Invalid API key");
      }
    } catch {
      setValidationState("error");
      setValidationMessage("Validation failed");
    }
  };

  const handleSaveKey = async () => {
    if (validationState !== "valid") return;
    setSaveLoading(true);
    try {
      await fetch("/api/user/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      completeOnboarding();
      router.push("/");
    } catch {
      // ignore
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSkip = async () => {
    await fetch("/api/onboarding", { method: "POST" }).catch(() => {});
    completeOnboarding();
    router.push("/");
  };

  const allBootstrapped = selectedRepos.every(
    (r) => bootstrapResults[`${r.owner}/${r.repo}`] !== undefined
  );

  return (
    <div className="space-y-6">
      {/* Step 1: Connected */}
      {step === "github_connected" && (
        <Card className="w-full border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <GitBranch className="h-5 w-5 text-cyan-500" />
              GitHub Connected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                {session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "U"}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-100">{session?.user?.name ?? "User"}</div>
                <div className="text-xs text-slate-400">{session?.user?.email}</div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-300">Permissions granted:</p>
              <ul className="space-y-1 text-sm text-slate-400">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-cyan-500" /> Repository access (read/write)</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-cyan-500" /> GitHub Actions workflows</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-cyan-500" /> Issues (read/write)</li>
              </ul>
            </div>
            <Button onClick={() => setStep("repo_selected")} className="w-full bg-cyan-600 hover:bg-cyan-700">
              Continue to Repository Selection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select Repos */}
      {step === "repo_selected" && (
        <Card className="w-full border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Rocket className="h-5 w-5 text-cyan-500" />
              Select Repositories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">Choose which repositories to enable DevFlow for.</p>
            {reposLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {repos.map((repo) => {
                  const key = `${repo.owner}/${repo.name}`;
                  const isSelected = selectedRepos.some((r) => r.owner === repo.owner && r.repo === repo.name);
                  return (
                    <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30 cursor-pointer hover:border-cyan-500/50">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => isSelected ? removeRepo(repo.owner, repo.name) : addRepo(repo.owner, repo.name)}
                        className="rounded border-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">{repo.owner}/{repo.name}</div>
                        {repo.description && <div className="text-xs text-slate-400 truncate">{repo.description}</div>}
                      </div>
                      {repo.isPrivate && <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-400">Private</Badge>}
                    </label>
                  );
                })}
                {repos.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No repositories found</p>}
              </div>
            )}
            <Button
              onClick={() => setStep("workflow_bootstrapped")}
              disabled={selectedRepos.length === 0}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
            >
              Continue to Bootstrap ({selectedRepos.length} selected)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Bootstrap */}
      {step === "workflow_bootstrapped" && (
        <Card className="w-full border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Rocket className="h-5 w-5 text-cyan-500" />
              Bootstrap Repositories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">Set up DevFlow labels and workflow in your selected repositories.</p>
            <div className="space-y-3">
              {selectedRepos.map((r) => {
                const key = `${r.owner}/${r.repo}`;
                const result = bootstrapResults[key];
                const isLoading = bootstrapLoading[key];
                return (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-700 bg-slate-800/30">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{key}</div>
                      {result && (
                        <div className="text-xs text-slate-400 mt-1">
                          {result.labels_created} labels created
                          {result.pr_url && <span> · <a href={result.pr_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">View PR</a></span>}
                        </div>
                      )}
                    </div>
                    {result ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleBootstrap(r.owner, r.repo)}
                        disabled={isLoading}
                        className="bg-cyan-600 hover:bg-cyan-700"
                      >
                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Bootstrap"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              onClick={() => setStep("keys_configured")}
              disabled={!allBootstrapped && selectedRepos.length > 0}
              className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
            >
              Continue to AI Keys
            </Button>
            <Button variant="outline" onClick={() => setStep("keys_configured")} className="w-full border-slate-700">
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: AI Keys */}
      {step === "keys_configured" && (
        <Card className="w-full border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Key className="h-5 w-5 text-cyan-500" />
              Configure AI Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">Add your AI provider API key to enable intelligent issue analysis.</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="provider" className="text-slate-300">Provider</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as "gemini" | "claude" | "qwen")}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                >
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                  <option value="qwen">Qwen</option>
                </select>
              </div>
              <div>
                <Label htmlFor="apiKey" className="text-slate-300">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="mt-1 bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
              {validationMessage && (
                <div className={`px-3 py-2 rounded-md text-sm ${
                  validationState === "valid" ? "bg-green-500/10 border border-green-500/30 text-green-400" :
                  validationState === "error" ? "bg-red-500/10 border border-red-500/30 text-red-400" :
                  "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400"
                }`}>
                  {validationMessage}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={!apiKey.trim() || validationState === "validating"}
                  className="flex-1 border-slate-700"
                >
                  {validationState === "validating" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                  Validate
                </Button>
                <Button
                  onClick={handleSaveKey}
                  disabled={validationState !== "valid" || saveLoading}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                >
                  {saveLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Save & Finish
                </Button>
              </div>
            </div>
            <button onClick={handleSkip} className="w-full text-sm text-slate-400 hover:text-slate-200 underline">
              Skip for now
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
