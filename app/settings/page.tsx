"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import { ScrollArea } from "@/components/ui/scroll-area";

import { Check, AlertTriangle, Loader2, GitBranch } from "lucide-react";

export const runtime = "nodejs";

interface ProviderKey {
  provider: "gemini" | "claude" | "qwen";
  configured: boolean;
  createdAt: string;
}

interface Repo {
  owner: string;
  repo: string;
}

interface WorkflowSettings {
  defaultProvider: "gemini" | "claude" | "qwen";
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("keys");
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings>({
    defaultProvider: "gemini",
  });
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "claude" | "qwen">("gemini");
  const [apiKey, setApiKey] = useState("");
  const [validationState, setValidationState] = useState<"idle" | "validating" | "error" | "valid">("idle");
  const [validationMessage, setValidationMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);


  useEffect(() => {
    if (!session?.user?.email) {
      window.location.href = "/";
      return;
    }

    fetchKeys();
    fetchRepos();
    loadWorkflowSettings();
  }, [session?.user?.email]);

  const fetchKeys = async () => {
    try {
      const response = await fetch(`/api/user/keys`);
      if (response.ok) {
        const data = await response.json();
        setKeys(data.keys || []);
      }
    } catch (error) {
      console.error("Failed to fetch keys:", error);
    }
  };

  const fetchRepos = async () => {
    try {
      const response = await fetch(`/api/repos`);
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    }
  };

  const loadWorkflowSettings = () => {
    const saved = localStorage.getItem("devflow_workflow_settings");
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setWorkflowSettings(settings);
      } catch (error) {
        console.error("Failed to parse workflow settings:", error);
      }
    }
  };

  const saveWorkflowSettings = (settings: WorkflowSettings) => {
    localStorage.setItem("devflow_workflow_settings", JSON.stringify(settings));
    setWorkflowSettings(settings);
    setSuccessToast(`Default provider set to ${settings.defaultProvider}`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const validateKey = async () => {
    if (!apiKey.trim()) {
      setValidationState("error");
      setValidationMessage("API key cannot be empty");
      return;
    }

    setValidationState("validating");
    setValidationMessage("Validating...");

    try {
      const response = await fetch(`/api/user/keys/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setValidationState("valid");
          setValidationMessage(`Valid ${selectedProvider} API key`);
        } else {
          setValidationState("error");
          setValidationMessage(data.error || "Invalid API key");
        }
      } else {
        setValidationState("error");
        setValidationMessage("Validation failed");
      }
    } catch {
      setValidationState("error");
      setValidationMessage("Validation failed");
    }
  };

  const saveKey = async () => {
    if (validationState !== "valid") {
      setValidationMessage("Please validate the API key first");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/user/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey,
        }),
      });

      if (response.ok) {
        setSuccessToast(`API key for ${selectedProvider} saved successfully`);
        setApiKey("");
        setValidationState("idle");
        setValidationMessage("");
        fetchKeys();
      } else {
        const error = await response.json();
        setValidationState("error");
        setValidationMessage(error.error || "Failed to save key");
      }
    } catch {
      setValidationState("error");
      setValidationMessage("Failed to save key");
    } finally {
      setLoading(false);
    }
  };

  const deleteKey = async (provider: string) => {
    if (!confirm(`Delete API key for ${provider}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/user/keys`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider }),
      });

      if (response.ok) {
        setSuccessToast(`API key for ${provider} deleted successfully`);
        fetchKeys();
      } else {
        setValidationMessage("Failed to delete key");
      }
    } catch {
      setValidationMessage("Failed to delete key");
    } finally {
      setLoading(false);
    }
  };

  const bootstrapRepo = async (owner: string, repo: string) => {
    if (!confirm(`Bootstrap DevFlow workflow for ${owner}/${repo}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner, repo }),
      });

      if (response.ok) {
        const data = await response.json();
        let message = `Successfully bootstrapped ${owner}/${repo}\n`;
        message += `Labels created: ${data.labels_created}\n`;
        if (data.labels_skipped > 0) {
          message += `Labels skipped: ${data.labels_skipped}\n`;
        }
        if (data.pr_url) {
          message += `PR created: ${data.pr_url}\n`;
        }
        if (data.already_bootstrapped) {
          message += "Repository was already bootstrapped";
        }
        
        setSuccessToast(message);
        fetchRepos();
      } else {
        const error = await response.json();
        setValidationMessage(error.error || "Failed to bootstrap");
      }
    } catch {
      setValidationMessage("Failed to bootstrap");
    } finally {
      setLoading(false);
    }
  };

  const renderKeysTab = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Configured AI Providers</h3>
        <div className="space-y-3">
          {keys.length === 0 ? (
            <Card className="p-4">
              <p className="text-sm text-slate-400">No API keys configured yet</p>
            </Card>
          ) : (
            keys.map((key) => (
              <Card key={key.provider} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <strong className="capitalize">{key.provider}</strong>
                      <Badge variant={key.configured ? "default" : "outline"}>
                        {key.configured ? "Configured" : "Not set"}
                      </Badge>
                    </div>
                  </div>
                  {key.configured && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteKey(key.provider)}
                      disabled={loading}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                {key.configured && (
                  <p className="text-xs text-slate-400 mt-1">
                    Configured on {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Add API Key</h3>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as "gemini" | "claude" | "qwen")}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                >
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                  <option value="qwen">Qwen</option>
                </select>
              </div>
              <div>
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key"
                  className="mt-1"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                onClick={validateKey}
                disabled={loading || !apiKey.trim()}
                className="flex-1"
              >
                {validationState === "validating" ? (
                  <Loader2 className="mr-2 h-4 w-4" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" />
                )}
                Validate
              </Button>
              
              <Button
                onClick={saveKey}
                disabled={loading || validationState !== "valid"}
                className="bg-cyan-500 hover:bg-cyan-600 border-transparent"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
            
            {validationMessage && (
              <div className={`mt-2 px-3 py-2 rounded-md ${
                validationState === "valid" ? "bg-green-500/10 border border-green-500/30" :
                validationState === "error" ? "bg-red-500/10 border border-red-500/30" :
                "bg-yellow-500/10 border border-yellow-500/30"
              }`}>
                <p className="text-sm">
                  {validationMessage}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderReposTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Tracked Repositories</h3>
      <div className="space-y-3">
        {repos.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-slate-400">No repositories configured</p>
          </Card>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {repos.map((repo) => (
                <Card key={`${repo.owner}/${repo.repo}`} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-4 w-4 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {repo.owner}/{repo.repo}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bootstrapRepo(repo.owner, repo.repo)}
                      disabled={loading}
                    >
                      Bootstrap
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );

  const renderWorkflowTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Default AI Provider</h3>
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="defaultProvider">Default Provider</Label>
            <select
              id="defaultProvider"
              value={workflowSettings.defaultProvider}
              onChange={(e) => saveWorkflowSettings({ defaultProvider: e.target.value as "gemini" | "claude" | "qwen" })}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
            >
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
              <option value="qwen">Qwen</option>
            </select>
          </div>
          
          <p className="text-sm text-slate-400">
            This provider will be used by default for AI-powered features when no specific provider is configured.
          </p>
        </div>
      </Card>
    </div>
  );

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="border-b border-slate-800 bg-slate-900/50">
          <TabsTrigger value="keys">AI Keys</TabsTrigger>
          <TabsTrigger value="repos">Repos</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          {renderKeysTab()}
        </TabsContent>

        <TabsContent value="repos">
          {renderReposTab()}
        </TabsContent>

        <TabsContent value="workflow">
          {renderWorkflowTab()}
        </TabsContent>
      </Tabs>

      {successToast && (
        <div className="fixed top-4 right-4 flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <Check className="h-5 w-5 text-green-400" />
          <span className="text-sm font-medium text-green-400">{successToast}</span>
        </div>
      )}
    </div>
  );
}