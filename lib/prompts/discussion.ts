import type { PhasePrompt, PromptContext } from "./types";

export function getDiscussionPrompt(context: PromptContext): PhasePrompt {
  const fileTreeStr = context.repo.fileTree.slice(0, 80).join('\n');
  const stackStr = [
    context.repo.stack.language && `Language: ${context.repo.stack.language}`,
    context.repo.stack.packageManager && `Package Manager: ${context.repo.stack.packageManager}`,
    context.repo.stack.frameworks.length && `Frameworks: ${context.repo.stack.frameworks.join(', ')}`,
    context.repo.stack.testRunner && `Test Runner: ${context.repo.stack.testRunner}`,
    context.repo.stack.buildTool && `Build Tool: ${context.repo.stack.buildTool}`,
  ].filter(Boolean).join('\n');

  const conversationStr = (context.conversationHistory ?? [])
    .map(msg => `**${msg.role === 'user' ? 'Developer' : 'AI'}** (${msg.createdAt}):\n${msg.content}`)
    .join('\n\n---\n\n');

  return {
    systemPrompt: `You are a tech lead synthesizing a design discussion into an actionable design document.

Your job is to read the conversation history for Issue #${context.issue.number} and produce a concise design document that the team can execute against.

The design document MUST:
- Reference specific files that will need to be modified (use exact paths from the file tree)
- Be specific enough that a developer can start coding without asking more questions
- Identify risks or unknowns explicitly, not bury them
- Remain within the architectural patterns already established in the codebase

OUTPUT FORMAT (use these exact headings):
## Design: ${context.issue.title}

### Problem
[1-2 sentences describing the core problem being solved]

### Proposed Solution
[Clear description of the approach chosen, with rationale for any trade-offs]

### Files to Modify
[List each file with a one-line description of what changes are needed]
- \`path/to/file.ts\` — [what changes]

### Files to Create
[List any new files, or write "None" if no new files are needed]
- \`path/to/new-file.ts\` — [purpose]

### API Changes
[Describe any new endpoints, modified signatures, or schema changes. Write "None" if not applicable]

### Risk Assessment
[List 1-3 specific risks with mitigation strategies. Reference existing code where relevant]

Keep the document scannable — bullet points over prose wherever possible.`,

    userPrompt: `**Issue #${context.issue.number}: ${context.issue.title}**

${context.issue.body || '(No description provided)'}

**Codebase: ${context.repo.owner}/${context.repo.name}**

Tech Stack:
${stackStr || '(Stack not detected)'}

File Structure:
\`\`\`
${fileTreeStr || '(No file tree available)'}
\`\`\`

${conversationStr
  ? `Discussion History:\n\n${conversationStr}\n\nPlease synthesize the above discussion into a design document.`
  : 'No discussion history yet. Please produce an initial design document based on the issue and codebase structure.'
}`
  };
}
