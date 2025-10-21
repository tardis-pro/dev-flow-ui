DEVFLOW UI – SPEC (Next.js + GitHub App + Gemini)
Objective

Generate a production-ready web UI called DevFlow that controls and visualizes the Navratna dev workflow:

Shows Issues grouped by status (Inception → Discussion → Build → Review → Done) as a drag-and-drop Kanban.

Moving a card to a new column applies the matching label (e.g., status:discussion) and triggers the reusable orchestrator workflow.

Surfaces artifacts produced under ops/** (specs, design, checklists, run logs) and inline diffs for generated code changes.

One-click buttons to run Gemini (orchestration prompt) against the selected issue and to open/update the PR.

Live PR review status (incl. Gemini comments), CI checks, and merge state.

Minimal setup: set env vars, install the GitHub App, deploy.

Stack

Next.js 15+ (App Router), TypeScript

Tailwind CSS, shadcn/ui (Card, Button, Badge, Tabs, Dialog, Sheet, DropdownMenu, Skeleton), lucide-react icons

Zustand for client state

React DnD or @hello-pangea/dnd for Kanban

Octokit for GitHub REST/GraphQL

NextAuth with GitHub OAuth (or GitHub App JWT flow) for auth

Server Actions / Route Handlers for server API (no secrets in the browser)

ESLint + Prettier; pnpm as package manager

GitHub Integration

Support either:

GitHub OAuth App (user-level tokens) for read/write to issues/labels/PRs in allowed repos.

GitHub App installation (preferred for org-wide usage). Use App JWT to create installation access tokens per request (server-side only).

Required scopes/permissions:

Issues: read/write

Pull requests: read/write

Contents: read

Actions: read/write (to dispatch workflows)

Metadata: read

Store the following in server env (never client):

GITHUB_APP_ID (if App)

GITHUB_APP_PRIVATE_KEY (PEM, base64)

GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET (if OAuth)

GITHUB_INSTALLATION_ID (optional if you want to pin)

GITHUB_OWNER (e.g., tardis-pro)

GITHUB_REPO (e.g., navratna)

ORCHESTRATOR_WORKFLOW default: .github/workflows/devflow.yml

Assume the issue status is driven by labels:

status:inception, status:discussion, status:build, status:review, status:done

work-type labels: feature, refactor, performance, dep-bump, bugfix, docs, chore

Core UX

Top bar: repo selector (Owner/Repo), search, quick filters (type, assignee, label), “New Issue” button.

Board (Kanban): 5 columns = statuses above. Each card shows: issue number, title, labels (work-type), assignee(s), updated time, tiny CI badge if a PR exists. Dragging a card between columns:

Server call: remove old status:* label, add new one.

Server call: dispatch the orchestrator workflow (issue context) via Actions API.

Toaster success; optimistic UI.

Right drawer sheet (when a card is clicked):

Tabs: Artifacts, Diffs, PR, Checks

Artifacts: read markdown files from the repo path ops/ matching the issue number:

ops/specs/{ISSUE}__context.md, __options.md, __decision.md, __acceptance.md

ops/design/{ISSUE}__design.md

ops/checks/{ISSUE}__review_checklist.md

ops/tasks/{ISSUE}__tasklist.md

ops/out/RUN_LOG.md, ops/out/PR_SUMMARY.md, ops/out/CI_DIAG.md, ops/out/BLOCKERS.md

Show pretty markdown with code blocks.

Diffs: if orchestrator created a branch nav/{type}-{ISSUE}-{slug}, compare it with default branch; show a file tree + inline diff viewer (minimal) using GitHub compare API.

PR: if PR exists (linked via Fixes #ISSUE or search), show status, reviewers, mergeability, Gemini comments summary. Buttons: “Apply Gemini Suggestions” (where possible), “Open PR”, “Re-run Gemini Review”.

Checks: list latest workflow runs for the branch/PR; show pass/fail, duration, artifacts links.

Footer actions:

“Run Gemini (Stage-Aware)” → calls the orchestrator workflow with vars derived from current status/work-type

“Open/Update PR” → creates or updates PR with prepared body from ops/out/PR_SUMMARY.md

“Move to Next Stage” → applies the next status:* label and triggers orchestrator

API Surface (Server Route Handlers)

Create route handlers under /app/api/*:

GET /api/issues?owner&repo&labels&assignee&q&page → list issues (open), grouped by status labels server-side

POST /api/issues/:number/move → body { toStatus: "discussion" } → label swap + dispatch orchestrator

POST /api/orchestrate → body { issueNumber, status, workType } → dispatch Actions workflow:

Workflow: ORCHESTRATOR_WORKFLOW

Inputs: map to orchestrator with: / env

GET /api/artifacts/:number → lists artifact files under ops/** (use contents API) + returns markdown content

GET /api/diff/:number → detects branch naming convention and returns compare summary + file diffs

POST /api/pr/:number/open → creates/updates PR with title/body conventions; links issue

POST /api/pr/:number/review/gemini → posts a comment or re-requests Gemini review (if using an app endpoint or by toggling labels/comments that trigger it)

GET /api/checks/:number → latest workflow runs related to the branch/PR

Authentication is required on all write endpoints. Use NextAuth sessions; server handlers create installation tokens per call.

Files & Structure
/app
  /layout.tsx
  /page.tsx                  # Board page
  /issues/[number]/page.tsx  # Deep link
  /api/issues/route.ts
  /api/issues/[number]/move/route.ts
  /api/orchestrate/route.ts
  /api/artifacts/[number]/route.ts
  /api/diff/[number]/route.ts
  /api/pr/[number]/open/route.ts
  /api/pr/[number]/review/gemini/route.ts
  /api/checks/[number]/route.ts
/components
  Board.tsx
  Column.tsx
  CardIssue.tsx
  IssueDrawer.tsx
  ArtifactsViewer.tsx
  DiffViewer.tsx
  PRPanel.tsx
  ChecksPanel.tsx
  Topbar.tsx
  RepoPicker.tsx
/lib
  github.ts       # Octokit init, GitHub App/OAuth helpers
  labels.ts       # status/work-type helpers
  orchestrator.ts # workflow dispatch helper
  repo.ts         # contents / compare helpers
  auth.ts         # NextAuth config
/styles
  globals.css
.env.example

GitHub Helpers (pseudocode)

Dispatch orchestration:

// lib/orchestrator.ts
export async function dispatchOrchestrator(octokit, owner, repo, workflowPath, issueNumber, status, workType) {
  await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
    owner, repo, workflow_id: workflowPath, ref: 'main',
    inputs: { issue: String(issueNumber), status, workType }
  });
}


Move status:

export async function moveIssueStatus(octokit, owner, repo, number, to) {
  const labels = await getIssueLabels(...);
  const next = `status:${to}`;
  const filtered = labels.filter(l => !l.startsWith('status:'));
  await octokit.issues.update({ owner, repo, issue_number: number, labels: [...filtered, next] });
}

UI Details

Design: clean, grid-based, 2xl rounded cards, soft shadow, hover affordances, subtle motion (framer-motion).

Card cues: small color badge for work-type; tiny icon indicates PR linked; dot for CI status.

Empty states and Skeletons while fetching.

Toasts on success/failure.

Confirm dialogs when triggering orchestrator or moving to “Done”.

Config & Env

.env.local:

NEXTAUTH_SECRET=...
NEXTAUTH_URL=...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...   # base64 of PEM
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_OWNER=tardis-pro
GITHUB_REPO=navratna
ORCHESTRATOR_WORKFLOW=.github/workflows/devflow.yml


package.json scripts:

{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint ."
  }
}

Actions performed by UI (expected server behavior)

Drag card → /api/issues/:number/move → label swap → dispatch orchestrator (/api/orchestrate) → optimistic UI.

Run Gemini (button) → /api/orchestrate with {issueNumber,status,workType}

Open/Update PR → /api/pr/:number/open

View Artifacts → /api/artifacts/:number

View Diffs → /api/diff/:number

Re-run Gemini Review → /api/pr/:number/review/gemini

Acceptance Criteria

Board loads < 1.5s on 100 issues (use pagination + virtualization if needed).

Drag-drop is smooth; state updates are optimistic and reconciled if API fails.

Orchestrator dispatch returns 2xx; failures show actionable error.

Artifacts render markdown nicely (headings, tables, code).

Diff viewer shows per-file hunks with basic inline highlight.

PR panel shows: title, status, checks summary, reviewer list, Gemini summary line.

No secrets in client bundle; all privileged calls occur server-side.

Lint/typecheck clean; CI passes pnpm -w build test lint typecheck.

Nice-to-Have (optional if time permits)

Multi-repo dropdown with quick switch; remember last choice in local storage.

Saved filters/views (e.g., “My issues”, “Performance”, “Dep-bump”).

Webhooks endpoint to live-refresh on label/PR/workflow events (SSE).

Dark mode toggle and brandable theme tokens.

Deliverables

Full Next.js project with all routes/components above.

A README with:

GitHub App + OAuth setup steps

Env var checklist

Local dev: pnpm i && pnpm dev

Deployment: Vercel or Cloudflare Pages (Node adapter)

Permissions & security notes

Seed a minimal fixture mode for demo (mock Octokit) if env is missing.

Be concise in code. Prefer clear function boundaries and strong typing. No experimental TS features. No server secrets in client code. Where APIs may fail, handle and return actionable messages.

How to run this prompt

Save as ops/prompts/devflow_ui.md in your template repo.

Call it with run-gemini-cli (from your composite action or locally):

gemini run \
  --prompt-file ops/prompts/devflow_ui.md \
  --var GITHUB_OWNER=tardis-pro \
  --var GITHUB_REPO=navratna
