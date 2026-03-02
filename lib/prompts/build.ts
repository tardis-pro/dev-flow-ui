import type { PhasePrompt, PromptContext } from "./types";

export function getBuildPrompt(context: PromptContext): PhasePrompt {
  const fileTreeStr = context.repo.fileTree.slice(0, 80).join('\n');
  const stackStr = [
    context.repo.stack.language && `Language: ${context.repo.stack.language}`,
    context.repo.stack.packageManager && `Package Manager: ${context.repo.stack.packageManager}`,
    context.repo.stack.frameworks.length && `Frameworks: ${context.repo.stack.frameworks.join(', ')}`,
    context.repo.stack.testRunner && `Test Runner: ${context.repo.stack.testRunner}`,
    context.repo.stack.buildTool && `Build Tool: ${context.repo.stack.buildTool}`,
  ].filter(Boolean).join('\n');

  // Pull the design doc from conversation history — it's the last AI message in discussion phase
  const designDoc = context.conversationHistory
    ?.filter(msg => msg.role === 'ai')
    .at(-1)?.content ?? '';

  const recentCommitsStr = context.repo.recentCommits.slice(0, 5)
    .map(c => `- ${c.sha.slice(0, 7)} ${c.message} (${c.author})`).join('\n');

  return {
    systemPrompt: `You are a senior engineer creating a concrete implementation plan. You write plans that a junior developer can follow without getting stuck.

Your plan for Issue #${context.issue.number} must be:
- Ordered: earlier steps must not depend on later steps
- Specific: use exact function names, file paths, and type names matching the codebase
- Testable: every change should have a clear verification step
- Complete: no "and so on" or "etc." — enumerate everything

OUTPUT FORMAT (use these exact headings):
## Implementation Plan: ${context.issue.title}

### Prerequisites
[Any setup needed before starting — branch name convention, migrations, env vars, etc.]

### Files to Create
[In order of creation. Write "None" if no new files]
- \`path/to/file.ts\`
  - Purpose: [what this file does]
  - Key exports: [function/type names to export]
  - Dependencies: [what it imports from]

### Files to Modify
[In order of modification — later changes depend on earlier ones]
- \`path/to/existing.ts\`
  - Add: [what to add]
  - Change: [what to change and why]
  - Remove: [what to remove if anything]

### Test Cases
[Specific test scenarios — not just "write tests". One line each]
- [ ] [Specific scenario that should pass]
- [ ] [Edge case to handle]
- [ ] [Error case to verify]

### Estimated Complexity
[One of: XS (< 1hr) / S (1-4hr) / M (half day) / L (full day) / XL (2+ days)]
Rationale: [1-2 sentences explaining the estimate]

### Definition of Done
[Checklist of verifiable completion criteria]
- [ ] [Specific criterion]`,

    userPrompt: `**Issue #${context.issue.number}: ${context.issue.title}**

${context.issue.body || '(No description provided)'}

**Codebase: ${context.repo.owner}/${context.repo.name}**

Tech Stack:
${stackStr || '(Stack not detected)'}

File Structure:
\`\`\`
${fileTreeStr || '(No file tree available)'}
\`\`\`

Recent Commits:
${recentCommitsStr || '(No recent commits)'}

${designDoc
  ? `Design Document (from discussion phase):\n\n${designDoc}\n\nPlease create an implementation plan based on the design above.`
  : 'No design document available. Please create an implementation plan based on the issue and codebase structure.'
}`
  };
}
