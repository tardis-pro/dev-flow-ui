"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-slate-400 mt-1">
              Configure AI providers and repository settings
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/")}
            className="rounded-full border-slate-700 hover:border-cyan-500/50"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
