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

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-me

# GitHub App (recommended)
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...   # base64-encoded PEM
GITHUB_INSTALLATION_ID=...

# GitHub OAuth fallback (optional)
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...

# Orchestrator workflow to dispatch
ORCHESTRATOR_WORKFLOW=.github/workflows/orchestrator-multi-provider.yml
```

Repositories are selected at runtime: once signed in, the repo picker shows
every repository your GitHub token can access (user repos or installations).

**Setting up GitHub App**: See the main [README.md](../README.md#github-app-setup-required-for-frontend) for detailed instructions on creating a GitHub App, generating the private key, and getting your Installation ID.

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

### Cloudflare Pages/Workers (Recommended)

The app is configured for Cloudflare deployment using `@opennextjs/cloudflare`.

#### Option A: Direct Deploy with Wrangler

1. **Install dependencies and build**:

   ```bash
   pnpm install
   pnpm cf:build
   ```

   This runs `next build` and processes output with OpenNext, emitting to `.open-next/worker/`.

2. **Preview locally** (optional):

   ```bash
   pnpm cf:dev
   ```

   Test GitHub OAuth and API behavior locally before deploying.

3. **Deploy**:

   ```bash
   pnpm cf:deploy
   ```

4. **Set environment variables**:

   Use `wrangler secret put` for sensitive values:
   ```bash
   echo "your-base64-key" | wrangler secret put GITHUB_APP_PRIVATE_KEY
   echo "your-secret" | wrangler secret put NEXTAUTH_SECRET
   ```

   Or set via Cloudflare dashboard: **Workers & Pages** → Your project → **Settings** → **Environment Variables**.

   Update `NEXTAUTH_URL` in `wrangler.toml` or as a secret once you know your final domain (e.g., `https://your-app.pages.dev`).

#### Option B: Cloudflare Pages Dashboard

1. **Connect GitHub repo** in Cloudflare Pages dashboard
2. **Build settings**:
   - Build command: `cd frontend && pnpm install && pnpm cf:build`
   - Build output directory: `frontend/.open-next/worker`
3. **Environment variables**: Add all variables from `.env.example` in the dashboard
4. **Deploy**: Push to your connected branch

### Vercel (Alternative)

Set environment variables in Vercel project settings, connect the repo, and deploy.

**Build settings**:
- Framework: Next.js
- Root Directory: `frontend`
- Build Command: `pnpm build`
- Install Command: `pnpm install`

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
