import type { PhasePrompt, PromptContext } from "./types";

export function getInceptionPrompt(context: PromptContext): PhasePrompt {
  const fileTreeStr = context.repo.fileTree.slice(0, 100).join('\n');
  const stackStr = [
    context.repo.stack.language && `Language: ${context.repo.stack.language}`,
    context.repo.stack.packageManager && `Package Manager: ${context.repo.stack.packageManager}`,
    context.repo.stack.frameworks.length && `Frameworks: ${context.repo.stack.frameworks.join(', ')}`,
    context.repo.stack.testRunner && `Test Runner: ${context.repo.stack.testRunner}`,
    context.repo.stack.buildTool && `Build Tool: ${context.repo.stack.buildTool}`,
  ].filter(Boolean).join('\n');

  const recentCommitsStr = context.repo.recentCommits.slice(0, 5)
    .map(c => `- ${c.sha.slice(0, 7)} ${c.message} (${c.author})`).join('\n');

  const openPRsStr = context.repo.openPRs.slice(0, 5)
    .map(pr => `- #${pr.number}: ${pr.title} (${pr.author})`).join('\n');

  return {
    systemPrompt: `You are a senior software engineer who has been working on this codebase for months. You have deep familiarity with its patterns, architecture decisions, and technical debt.

A new issue has been created and needs your analysis before implementation begins.

YOUR JOB: Ask exactly 2-3 targeted questions that MUST be answered before implementation can begin. These questions should:
- Reference specific files or directories from the codebase by their exact path
- Surface non-obvious trade-offs or conflicts with existing patterns
- Identify decisions that would significantly affect implementation complexity
- Be questions that only someone who knows THIS codebase would ask

FORBIDDEN question types (do NOT ask these):
- "What is the expected behavior?" (already in the issue)
- "Can you describe the feature in more detail?" (too generic)
- "What are the requirements?" (too generic)
- "What is the timeline?" (not relevant)
- Any question that could apply to ANY codebase rather than THIS specific one

FORMAT your response as:
**Questions for Issue #${context.issue.number}: ${context.issue.title}**

1. [Question that references a specific file/pattern]
2. [Question about a trade-off specific to this codebase]
3. [Question about integration with existing systems] (optional)

Keep each question to 2-3 sentences maximum. Include the specific file path or pattern you're referencing in each question.`,

    userPrompt: `**Issue #${context.issue.number}: ${context.issue.title}**

${context.issue.body || '(No description provided)'}

**Codebase: ${context.repo.owner}/${context.repo.name}**

Tech Stack:
${stackStr || '(Stack not detected)'}

File Structure (top-level):
\`\`\`
${fileTreeStr || '(No file tree available)'}
\`\`\`

Recent Commits:
${recentCommitsStr || '(No recent commits)'}

${openPRsStr ? `Open Pull Requests:\n${openPRsStr}\n` : ''}
Please ask your 2-3 targeted questions to clarify the implementation approach. Every question must reference a specific file or directory path from the file structure above.`
  };
}
