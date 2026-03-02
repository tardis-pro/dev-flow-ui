import type { IssueStatus } from "@/lib/labels";

export type RepoStack = {
  language?: string;
  packageManager?: string;
  frameworks: string[];
  testRunner?: string;
  buildTool?: string;
};

export type RecentCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
};

export type RepoContext = {
  fileTree: string[];
  stack: RepoStack;
  recentCommits: RecentCommit[];
  openPRs: { number: number; title: string; author: string }[];
};

export type ConversationMessage = {
  role: 'user' | 'ai';
  content: string;
  createdAt?: string;
  };

export type PromptContext = {
  issue: {
    number: number;
    title: string;
    body: string;
    labels: string[];
  };
  repo: {
    owner: string;
    name: string;
  } & RepoContext;
  conversationHistory?: ConversationMessage[];
  phase: IssueStatus;
  relatedFiles?: string[];
};

export type PhasePrompt = {
  systemPrompt: string;
  userPrompt: string;
};
