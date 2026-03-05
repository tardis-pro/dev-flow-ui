"use client";

import { useOnboardingStore } from "@/lib/stores/onboarding-store";

const STEPS = [
  { id: "github_connected", label: "Connected" },
  { id: "repo_selected", label: "Select Repos" },
  { id: "workflow_bootstrapped", label: "Bootstrap" },
  { id: "keys_configured", label: "AI Keys" },
];

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { step } = useOnboardingStore();
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-100">Setup DevFlow</h1>
            <span className="text-sm text-slate-400">
              Step {currentIndex + 1} of {STEPS.length}
            </span>
          </div>
          {/* Progress steps */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors ${
                    i < currentIndex
                      ? "bg-cyan-500 border-cyan-500 text-white"
                      : i === currentIndex
                      ? "border-cyan-500 text-cyan-400 bg-transparent"
                      : "border-slate-700 text-slate-600 bg-transparent"
                  }`}
                >
                  {i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 ${i < currentIndex ? "bg-cyan-500" : "bg-slate-700"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {STEPS.map((s) => (
              <span key={s.id} className="text-[10px] text-slate-500 flex-1 text-center">{s.label}</span>
            ))}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
