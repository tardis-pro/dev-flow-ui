"use client";

import { create } from "zustand";

export type OnboardingStep =
  | "github_connected"
  | "repo_selected"
  | "workflow_bootstrapped"
  | "keys_configured"
  | "done";

type SelectedRepo = {
  owner: string;
  repo: string;
};

type OnboardingState = {
  step: OnboardingStep;
  completed: boolean;
  selectedRepos: SelectedRepo[];
  isLoading: boolean;
  // Actions
  setStep: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  addRepo: (owner: string, repo: string) => void;
  removeRepo: (owner: string, repo: string) => void;
  setLoading: (value: boolean) => void;
  isOnboardingComplete: () => boolean;
  reset: () => void;
};

const initialState = {
  step: "github_connected" as OnboardingStep,
  completed: false,
  selectedRepos: [] as SelectedRepo[],
  isLoading: false,
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialState,
  setStep(step) {
    set({ step });
  },
  completeOnboarding() {
    set({ completed: true, step: "done" });
  },
  addRepo(owner, repo) {
    const { selectedRepos } = get();
    const exists = selectedRepos.some((r) => r.owner === owner && r.repo === repo);
    if (!exists) {
      set({ selectedRepos: [...selectedRepos, { owner, repo }] });
    }
  },
  removeRepo(owner, repo) {
    const { selectedRepos } = get();
    set({
      selectedRepos: selectedRepos.filter(
        (r) => !(r.owner === owner && r.repo === repo),
      ),
    });
  },
  setLoading(value) {
    set({ isLoading: value });
  },
  isOnboardingComplete() {
    return get().completed;
  },
  reset() {
    set(initialState);
  },
}));
