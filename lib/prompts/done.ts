import type { PhasePrompt, PromptContext } from "./types";

export function getDonePrompt(context: PromptContext): PhasePrompt {
  // Extract a brief summary from conversation history — last few AI messages
  const recentContext = (context.conversationHistory ?? [])
    .filter(msg => msg.role === 'ai')
    .slice(-3)
    .map(msg => msg.content.slice(0, 500))
    .join('\n\n');

  const labelsStr = context.issue.labels.length > 0
    ? context.issue.labels.join(', ')
    : '(none)';

  return {
    systemPrompt: `You are a technical writer creating concise release notes for a changelog.

RULES:
- Be factual and specific — no marketing language
- 1-2 sentences maximum for the summary
- Use past tense ("Added", "Fixed", "Updated", "Removed")
- Include the issue number as a reference
- Mention the user-visible impact, not the implementation details
- Do NOT say "this PR" or "this commit" — write it as a standalone changelog entry

OUTPUT FORMAT:
## Changelog Entry

**[Type]:** [1-2 sentence description starting with a past-tense verb]

> _Issue #${context.issue.number} · ${context.repo.owner}/${context.repo.name}_

Where [Type] is one of: Added / Fixed / Changed / Deprecated / Removed / Security

Then on a new line, provide an optional technical note (1 sentence max) for developers:

**Technical:** [Optional developer-facing detail about implementation approach]`,

    userPrompt: `**Issue #${context.issue.number}: ${context.issue.title}**

${context.issue.body || '(No description provided)'}

**Labels:** ${labelsStr}

**Repository:** ${context.repo.owner}/${context.repo.name}

${recentContext
  ? `Implementation Summary (from conversation):\n${recentContext}\n\nPlease write a 1-2 sentence changelog entry for this completed work.`
  : 'Please write a 1-2 sentence changelog entry for this completed work based on the issue title and description.'
}`
  };
}
