# DevFlow UI

DevFlow is a Next.js + TypeScript dashboard for steering the Navratna development workflow end-to-end. It provides a Kanban view over GitHub issues, rich artifact/diff introspection, one-click Gemini orchestration, and PR lifecycle controls — all backed by GitHub App + OAuth authentication.

## Features

- Drag-and-drop Kanban (Inception → Discussion → Build → Review → Done) with optimistic status updates and workflow dispatches.
- Drawer experience for each issue surfacing ops/ artifacts, nav/* branch diffs, PR health, Gemini summaries, and CI runs.
- Server-only GitHub access via Octokit with GitHub App installation tokens or user OAuth tokens (NextAuth).
- Zustand-powered client state, shadcn/ui components, Tailwind styling, and Sonner toasts.
- Fixture mode gracefully renders sample data when required credentials are absent.

## Project Structure

```
frontend/
├─ app/
│  ├─ page.tsx                 # Main board
│  ├─ layout.tsx               # Global layout & providers
│  ├─ issues/[number]/page.tsx # Deep-link redirect support
│  └─ api/…                    # Route handlers for GitHub + orchestration
├─ components/                 # UI primitives & feature components
├─ lib/                        # Octokit helpers, labels, env parsing, services
├─ lib/stores/board-store.ts   # Zustand store for board + drawer state
├─ ops/prompts/devflow_ui.md   # Gemini scaffolding prompt
├─ styles/globals.css          # Global styles & theme
└─ README.md
```

## Prerequisites

- Node.js 20+
- pnpm 8+
- GitHub App **or** GitHub OAuth App configured with the following scopes/permissions:
  - Issues (read/write)
  - Pull requests (read/write)
  - Contents (read)
  - Actions (read/write)
  - Metadata (read)

## Environment Variables

Create `.env.local` (see `.env.example` for the full list):

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-me

# GitHub App (recommended)
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...   # base64-encoded PEM
GITHUB_INSTALLATION_ID=...

# GitHub OAuth fallback
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...

# Repo defaults
GITHUB_OWNER=tardis-pro
GITHUB_REPO=navratna
ORCHESTRATOR_WORKFLOW=.github/workflows/devflow.yml
```

## Local Development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and sign in with GitHub. Drag-and-drop moves issues, triggers the Navratna orchestrator, and the drawer loads artifacts/diffs via the GitHub API.

### Useful scripts

| Command        | Description                            |
| -------------- | -------------------------------------- |
| `pnpm dev`     | Launches the Next.js dev server        |
| `pnpm build`   | Production build                       |
| `pnpm start`   | Runs the built app                     |
| `pnpm lint`    | ESLint validation (typescript-aware)   |

## Deployment

- **Vercel**: set the environment variables above in your project, connect the repo, and deploy. Edge runtime is supported (route handlers only call GitHub server-side).
- **Cloudflare Pages / Node adapters**: run `pnpm build` and deploy `.vercel/output` or the `.next` build artifacts with a Node 18+ runtime.

## Security Notes

- All GitHub calls run server-side; the browser never sees secrets or tokens.
- Installation access tokens are minted per request when a GitHub App is configured.
- Fixture responses (`sampleBoard`, etc.) keep the UI usable when secrets are missing; monitor logs for fallbacks in production.

## Gemini Prompt

Automate scaffolding or regeneration by piping `ops/prompts/devflow_ui.md` into your Gemini tooling:

```bash
gemini run \
  --prompt-file ops/prompts/devflow_ui.md \
  --var GITHUB_OWNER=tardis-pro \
  --var GITHUB_REPO=navratna
```

## Next Steps

1. Configure the GitHub App webhook to push live updates (label/PR/workflow events) and wire into an SSE endpoint.
2. Persist repo & filter preferences in local storage for quick switching.
3. Expand Gemini automation hooks (e.g., apply suggestions, summarize PR feedback) using custom route handlers.
