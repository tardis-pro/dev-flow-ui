import type { IssueStatus } from "@/lib/labels";
import type { PromptContext, PhasePrompt } from "./types";
import { getInceptionPrompt } from "./inception";
import { getDiscussionPrompt } from "./discussion";
import { getBuildPrompt } from "./build";
import { getReviewPrompt } from "./review";
import { getDonePrompt } from "./done";

export type { PromptContext, PhasePrompt, RepoStack, RepoContext, ConversationMessage } from "./types";

export function getPromptForPhase(phase: IssueStatus, context: PromptContext): PhasePrompt {
  switch (phase) {
    case 'inception': return getInceptionPrompt(context);
    case 'discussion': return getDiscussionPrompt(context);
    case 'build': return getBuildPrompt(context);
    case 'review': return getReviewPrompt(context);
    case 'done': return getDonePrompt(context);
  }
}
