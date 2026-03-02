# DevFlow SaaS Transformation

## TL;DR

> **Quick Summary**: Transform DevFlow UI from a single-tenant private dashboard into a multi-tenant SaaS product where users sign in via GitHub, onboard repos, bring their own AI keys (Gemini/Claude/Qwen), and use an AI-powered issue workflow where AI posts contextual comments on GitHub issues — all running on Cloudflare Workers.
>
> **Deliverables**:
> - CF D1 database + KV namespace for multi-tenant storage
> - Web Crypto encryption for BYOK API key management
> - User onboarding wizard (Connect → Repos → Bootstrap → Keys)
> - One-click repo bootstrap (labels + workflow PR via Octokit)
> - Repo context engine (file tree, stack detection, recent activity)
> - AI orchestration via CF Worker → AI provider → GitHub comment (replacing GitHub Actions dispatch)
> - Design phase chat UI in IssueDrawer (inline AI conversation loop)
> - Settings page for key/repo/workflow management
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: D1 schema → encryption util → BYOK API → context engine → AI orchestration → design chat

---

## Context

### Original Request
Transform DevFlow UI into a SaaS product at code.tardis.digital. Users onboard repos, bring their own AI keys, and the AI orchestration happens on CF Workers (not GitHub Actions). AI output goes as GitHub issue comments, not committed files. Design phase should be conversational — AI asks deep, context-aware questions referencing actual codebase files. Everything except agentic coding lives in this UI.

### Interview Summary
**Key Discussions**:
- **Option B chosen**: CF Worker calls AI providers directly, bypasses GitHub Actions entirely
- **Comments, not artifacts**: AI posts to GitHub issues as comments, not `ops/out/` files — thread IS the artifact
- **No webhooks in v1**: User replies through DevFlow UI only; reply endpoint does inline round-trip (post comment → fetch thread → call AI → post response → return)
- **Deep questions**: AI must reference actual codebase files/patterns (file tree + stack + recent commits fed as context)
- **Existing infra preserved**: Kanban board, drag-drop, Column/Card/RepoPicker components, existing issue/PR/diff/checks routes stay

**Research Findings**:
- 13 existing API routes, Zustand board store with optimistic updates, fixture fallback mode
- Auth uses JWT strategy with two Octokit client factories (installation + user token)
- `wrangler.toml` has `nodejs_compat` flag, deployed as "code" worker to code.tardis.digital
- `ai-dev-workflow-action` repo has multi-provider support + label-driven state machine + prompt templates — reference for prompt design
- `lib/orchestrator.ts` is the single seam to replace with `callAIAndComment()`

### Metis Review
**Identified Gaps** (addressed):
- **Tenant model**: Default to per-GitHub-user tenancy (userId from NextAuth session). Shared D1 with `user_id` column.
- **Idempotency**: GitHub comment writes must be idempotent — embed hidden marker in comment body to detect duplicates
- **Token model**: OAuth token for user-facing writes (comments, bootstrap PR). Installation token only for read-heavy operations where user token isn't available.
- **BYOK ownership**: Per-user keys only in v1. No org-level key sharing.
- **Key security**: Decrypt only in-memory per request. Never log decrypted material. AES-GCM via Web Crypto with key derived from NEXTAUTH_SECRET + userId.
- **Failure policy**: Surface "retry" button in UI on transient failures. No automatic retry queue in v1.
- **Runtime compat**: Must verify NextAuth v4 + Octokit auth-app RSA on CF Workers with nodejs_compat. Add explicit smoke test.
- **Comment identity**: Post as the user's GitHub account (their OAuth token). No separate bot account needed in v1.
- **Edge cases**: Repo renamed/transferred, issue closed during conversation, concurrent card moves, provider timeout mid-thread, large repos causing context timeout — all addressed with defensive guards.

---

## Work Objectives

### Core Objective
Build a self-service SaaS product where any GitHub user can sign up, connect repos, configure AI provider keys, and use an AI-powered issue workflow that posts contextual comments on GitHub issues — entirely through the DevFlow UI on CF Workers.

### Concrete Deliverables
- `wrangler.toml` with D1 binding + KV namespace
- D1 migration files: `users`, `user_repos`, `provider_keys` tables
- `lib/crypto.ts` — AES-GCM encryption/decryption via Web Crypto
- `/api/user/keys` — CRUD routes for encrypted BYOK keys
- `/api/user/keys/validate` — test provider key before saving
- `/app/onboarding/page.tsx` — multi-step wizard
- `/api/bootstrap/route.ts` — create labels + commit devflow.yml + open PR
- `/api/repo/[owner]/[repo]/context/route.ts` — file tree + stack detection
- `lib/context-builder.ts` — assemble context bundle for AI
- `lib/ai-client.ts` — multi-provider AI client (Gemini/Claude/Qwen)
- `lib/orchestrator.ts` — rewritten: `callAIAndComment()` replacing `dispatchOrchestrator()`
- `lib/prompts/` — prompt templates per phase (inception, discussion, build, review, done)
- `/api/conversation/[number]/reply/route.ts` — inline AI reply endpoint
- `components/DesignChat.tsx` — chat UI in IssueDrawer Design tab
- `/app/settings/page.tsx` — key/repo/workflow management
- `lib/stores/onboarding-store.ts` — onboarding state machine

### Definition of Done
- [ ] `pnpm build` succeeds with zero errors
- [ ] `pnpm lint` passes
- [ ] All D1 migrations apply cleanly: `wrangler d1 migrations apply DB --local`
- [ ] Encryption roundtrip test passes
- [ ] Bootstrap creates labels + PR on a test repo (idempotent on re-run)
- [ ] Card move triggers AI call → GitHub comment posted
- [ ] Design chat reply → AI response posted as next comment
- [ ] Settings page saves/loads/deletes encrypted keys
- [ ] Onboarding wizard completes all 4 steps
- [ ] No `dispatchOrchestrator()` references remain in codebase

### Must Have
- Per-user encrypted BYOK storage (CF KV + Web Crypto AES-GCM)
- Multi-provider AI support (Gemini, Claude, Qwen)
- Onboarding wizard with repo bootstrap
- AI-as-comment output (not committed files)
- Repo context engine feeding AI (file tree, stack, recent activity)
- Design phase conversational chat in IssueDrawer
- Idempotent GitHub comment writes (hidden marker dedup)
- Settings page for key/repo management

### Must NOT Have (Guardrails)
- **No GitHub Actions dispatch** — AI runs on CF Worker, not via workflow_dispatch
- **No ops/out/ file commits** — AI output is GitHub comments only
- **No webhooks in v1** — all interaction through DevFlow UI
- **No bot account** — comments posted as the authenticated user
- **No automatic retry queue** — surface retry button on failure
- **No org-level key sharing** — per-user keys only
- **No agentic coding / code generation** — AI comments/discusses only
- **No AI writes to repository contents** at runtime (bootstrap PR is the sole exception, via explicit user action)
- **No enterprise SSO/billing/invoicing** in v1
- **No provider expansion beyond Gemini/Claude/Qwen** in v1
- **No decrypted keys in logs/errors** — redact all sensitive material
- **No cross-tenant data access** — all DB queries scoped by userId
- **No `as any` or `@ts-ignore`** — strict TypeScript throughout

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: NO (no test framework currently set up)
- **Automated tests**: YES (Tests-after) — add vitest for critical paths
- **Framework**: vitest (lightweight, CF Workers compatible, works with bun)
- **Test scope**: Security (encryption), idempotency (bootstrap, comments), tenant isolation, API contracts

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Infrastructure**: Use wrangler CLI — migrations, KV ops, D1 queries
- **Library/Module**: Use vitest or bun REPL — import, call, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately, 7 tasks):
├── Task 1: Vitest setup + test infrastructure [quick]
├── Task 2: CF D1 schema + migrations [quick]
├── Task 3: CF KV namespace + wrangler.toml bindings [quick]
├── Task 4: Web Crypto encryption utility (lib/crypto.ts) [deep]
├── Task 5: Multi-provider AI client (lib/ai-client.ts) [deep]
├── Task 6: Prompt templates per phase (lib/prompts/) [unspecified-high]
├── Task 7: Onboarding store (lib/stores/onboarding-store.ts) [quick]

Wave 2 (Core APIs — after Wave 1, 7 tasks):
├── Task 8: BYOK key CRUD API (/api/user/keys) (depends: 2, 3, 4) [deep]
├── Task 9: BYOK key validation API (/api/user/keys/validate) (depends: 5, 8) [unspecified-high]
├── Task 10: Repo context engine (/api/repo/context) (depends: none from Wave 1, uses existing Octokit) [deep]
├── Task 11: Context builder service (lib/context-builder.ts) (depends: 10) [deep]
├── Task 12: Bootstrap API (/api/bootstrap) (depends: 2) [deep]
├── Task 13: D1 user/repo management service (lib/services/user.ts) (depends: 2) [unspecified-high]
├── Task 14: Idempotent comment writer utility (lib/github-comments.ts) (depends: none) [unspecified-high]

Wave 3 (AI Orchestration — after Wave 2, 5 tasks):
├── Task 15: Replace dispatchOrchestrator → callAIAndComment (depends: 5, 6, 11, 14) [deep]
├── Task 16: Card move AI trigger integration (depends: 15) [unspecified-high]
├── Task 17: Conversation reply API (/api/conversation/[number]/reply) (depends: 11, 14, 15) [deep]
├── Task 18: Update /api/issues/[number]/move to use new orchestrator (depends: 15, 16) [unspecified-high]
├── Task 19: Remove old ArtifactsViewer references + dispatchOrchestrator cleanup (depends: 15) [quick]

Wave 4 (UI — after Wave 2 partial, 6 tasks):
├── Task 20: Onboarding wizard page (app/onboarding/page.tsx) (depends: 7, 12, 8) [visual-engineering]
├── Task 21: Settings page (app/settings/page.tsx) (depends: 8, 13) [visual-engineering]
├── Task 22: Design chat component (components/DesignChat.tsx) (depends: 17) [visual-engineering]
├── Task 23: IssueDrawer Design tab integration (depends: 22) [visual-engineering]
├── Task 24: Onboarding redirect logic in app/page.tsx (depends: 7, 13, 20) [quick]
├── Task 25: Update Topbar + RepoPicker for onboarding state (depends: 7, 13) [visual-engineering]

Wave 5 (Integration + Security — after Waves 3-4, 5 tasks):
├── Task 26: Encryption roundtrip + tenant isolation tests (depends: 4, 8) [deep]
├── Task 27: Bootstrap idempotency test (depends: 12) [unspecified-high]
├── Task 28: AI comment idempotency test (depends: 15, 16) [unspecified-high]
├── Task 29: CF Workers runtime compatibility audit (depends: all) [deep]
├── Task 30: Full build + lint + type-check pass (depends: all) [quick]

Wave FINAL (Independent review — after ALL tasks, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA walkthrough (unspecified-high)
├── Task F4: Scope fidelity check (deep)

Critical Path: Task 2 → Task 4 → Task 8 → Task 11 → Task 15 → Task 17 → Task 22 → Task 23 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 26, 27, 28 | 1 |
| 2 | — | 8, 12, 13 | 1 |
| 3 | — | 8 | 1 |
| 4 | — | 8, 26 | 1 |
| 5 | — | 9, 15 | 1 |
| 6 | — | 15 | 1 |
| 7 | — | 20, 24, 25 | 1 |
| 8 | 2, 3, 4 | 9, 20, 21, 26 | 2 |
| 9 | 5, 8 | — | 2 |
| 10 | — | 11 | 2 |
| 11 | 10 | 15, 17 | 2 |
| 12 | 2 | 20, 27 | 2 |
| 13 | 2 | 21, 24, 25 | 2 |
| 14 | — | 15, 17, 28 | 2 |
| 15 | 5, 6, 11, 14 | 16, 17, 18, 19, 28 | 3 |
| 16 | 15 | 18, 28 | 3 |
| 17 | 11, 14, 15 | 22 | 3 |
| 18 | 15, 16 | — | 3 |
| 19 | 15 | — | 3 |
| 20 | 7, 12, 8 | 24 | 4 |
| 21 | 8, 13 | — | 4 |
| 22 | 17 | 23 | 4 |
| 23 | 22 | — | 4 |
| 24 | 7, 13, 20 | — | 4 |
| 25 | 7, 13 | — | 4 |
| 26 | 1, 4, 8 | — | 5 |
| 27 | 1, 12 | — | 5 |
| 28 | 1, 15, 16 | — | 5 |
| 29 | all | — | 5 |
| 30 | all | — | 5 |

### Agent Dispatch Summary

- **Wave 1 (7)**: T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `deep`, T5 → `deep`, T6 → `unspecified-high`, T7 → `quick`
- **Wave 2 (7)**: T8 → `deep`, T9 → `unspecified-high`, T10 → `deep`, T11 → `deep`, T12 → `deep`, T13 → `unspecified-high`, T14 → `unspecified-high`
- **Wave 3 (5)**: T15 → `deep`, T16 → `unspecified-high`, T17 → `deep`, T18 → `unspecified-high`, T19 → `quick`
- **Wave 4 (6)**: T20 → `visual-engineering`, T21 → `visual-engineering`, T22 → `visual-engineering`, T23 → `visual-engineering`, T24 → `quick`, T25 → `visual-engineering`
- **Wave 5 (5)**: T26 → `deep`, T27 → `unspecified-high`, T28 → `unspecified-high`, T29 → `deep`, T30 → `quick`
- **FINAL (4)**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 1 — Foundation (Start Immediately)

- [ ] 1. Vitest Test Infrastructure Setup

  **What to do**:
  - Install vitest as dev dependency
  - Create `vitest.config.ts` with path aliases matching `tsconfig.json` (`@/*` maps to `./*`)
  - Create `tests/` directory structure: `tests/security/`, `tests/api/`, `tests/services/`
  - Write a smoke test `tests/smoke.test.ts` that imports from `@/lib/utils` to verify path resolution
  - Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts

  **Must NOT do**: Do not add jest. Do not write tests for existing code.

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 1 (parallel with T2-T7) | Blocks: T26, T27, T28 | Blocked By: None

  **References**:
  - `tsconfig.json` — path aliases to mirror in vitest config
  - `package.json` — existing scripts section, dev dependencies pattern
  - Vitest docs: https://vitest.dev/config/

  **Acceptance Criteria**:
  - [ ] `pnpm vitest run tests/smoke.test.ts` → exit 0, 1 test passed
  - [ ] vitest.config.ts exists with correct path aliases

  **QA Scenarios:**
  ```
  Scenario: Vitest runs smoke test
    Tool: Bash
    Steps: 1. pnpm vitest run tests/smoke.test.ts 2. Assert exit 0, stdout contains "1 passed"
    Evidence: .sisyphus/evidence/task-1-vitest-smoke.txt
  ```

  **Commit**: `chore(test): add vitest infrastructure` | Files: vitest.config.ts, tests/smoke.test.ts, package.json

---

- [ ] 2. CF D1 Database Schema + Migrations

  **What to do**:
  - Add D1 database binding to `wrangler.toml`: `[[d1_databases]]` name=DB, database_name=devflow-db
  - Create `migrations/0001_initial.sql` with tables:
    - `users` (id TEXT PK, github_id TEXT UNIQUE NOT NULL, github_login TEXT NOT NULL, email TEXT, avatar_url TEXT, created_at TEXT, updated_at TEXT)
    - `user_repos` (id TEXT PK, user_id TEXT NOT NULL REFERENCES users(id), owner TEXT NOT NULL, repo TEXT NOT NULL, bootstrapped INTEGER DEFAULT 0, default_ai_provider TEXT, created_at TEXT, UNIQUE(user_id, owner, repo))
    - `onboarding_state` (user_id TEXT PK REFERENCES users(id), step TEXT NOT NULL DEFAULT 'github_connected', completed INTEGER DEFAULT 0, updated_at TEXT)
  - Create `lib/db.ts` — D1 binding accessor with typed query helpers. ALL queries must include user_id in WHERE clause (tenant isolation).

  **Must NOT do**: No ORM. No data seeding. No extra indices beyond PK/UNIQUE.

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 1 (parallel with T1, T3-T7) | Blocks: T8, T12, T13 | Blocked By: None

  **References**:
  - `wrangler.toml:1-9` — existing bindings section to extend
  - `lib/env.ts` — pattern for typed config/accessor singletons
  - CF D1 docs: https://developers.cloudflare.com/d1/
  - D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/

  **Acceptance Criteria**:
  - [ ] `wrangler d1 migrations apply DB --local` → exit 0, tables created
  - [ ] D1 query shows `users`, `user_repos`, `onboarding_state` tables exist
  - [ ] `lib/db.ts` exports typed query functions with mandatory user_id params

  **QA Scenarios:**
  ```
  Scenario: D1 migrations apply and tables exist
    Tool: Bash
    Steps: 1. wrangler d1 migrations apply DB --local 2. wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','user_repos','onboarding_state');" 3. Assert all 3 tables
    Evidence: .sisyphus/evidence/task-2-d1-migrations.txt

  Scenario: Tenant isolation — every query includes user_id
    Tool: Bash (grep lib/db.ts)
    Steps: 1. grep all SELECT/UPDATE/DELETE 2. Assert every tenant-table query has user_id param
    Evidence: .sisyphus/evidence/task-2-tenant-isolation.txt
  ```

  **Commit**: group with T3 | `feat(infra): add CF D1 schema and KV bindings`

---

- [ ] 3. CF KV Namespace + Wrangler Bindings

  **What to do**:
  - Add KV namespace binding to `wrangler.toml`: `[[kv_namespaces]]` binding=USER_KEYS
  - Create `lib/kv.ts` — typed KV accessor: getUserKey, setUserKey, deleteUserKey, listUserKeys
  - Key naming: `{userId}:{provider}` (e.g., `user_123:gemini`)
  - KV values are already-encrypted strings (encryption in lib/crypto.ts)

  **Must NOT do**: Do not handle encryption here. Do not store unencrypted keys.

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 1 | Blocks: T8 | Blocked By: None

  **References**:
  - `wrangler.toml:1-9` — existing config
  - CF KV docs: https://developers.cloudflare.com/kv/

  **Acceptance Criteria**:
  - [ ] `wrangler.toml` contains `[[kv_namespaces]]` with binding USER_KEYS
  - [ ] `lib/kv.ts` exports all 4 functions
  - [ ] `pnpm build` passes

  **QA Scenarios:**
  ```
  Scenario: KV binding in wrangler.toml
    Tool: Bash (grep)
    Steps: 1. grep wrangler.toml for USER_KEYS 2. Assert present
    Evidence: .sisyphus/evidence/task-3-kv-binding.txt
  ```

  **Commit**: group with T2 | `feat(infra): add CF D1 schema and KV bindings`

---

- [ ] 4. Web Crypto AES-GCM Encryption Utility

  **What to do**:
  - Create `lib/crypto.ts`:
    - `deriveKey(secret: string, userId: string): Promise<CryptoKey>` — PBKDF2 from NEXTAUTH_SECRET + userId salt → AES-GCM 256-bit key
    - `encrypt(plaintext: string, key: CryptoKey): Promise<string>` — random 12-byte IV, AES-GCM, return base64(iv || ciphertext || tag)
    - `decrypt(ciphertext: string, key: CryptoKey): Promise<string>` — decode base64, extract IV, decrypt
    - Convenience: `encryptForUser(plaintext, userId)` and `decryptForUser(ciphertext, userId)`
  - Use `globalThis.crypto.subtle` ONLY — NOT Node's crypto module

  **Must NOT do**: No `import crypto`. No hardcoded keys/IVs. No logging of decrypted values.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 1 | Blocks: T8, T26 | Blocked By: None

  **References**:
  - `lib/env.ts:21-35` — singleton pattern
  - Web Crypto SubtleCrypto: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
  - AES-GCM encrypt: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm

  **Acceptance Criteria**:
  - [ ] Exports: deriveKey, encrypt, decrypt, encryptForUser, decryptForUser
  - [ ] Zero `import crypto` or `require('crypto')` — only `globalThis.crypto.subtle`
  - [ ] Roundtrip: encrypt("test") → decrypt → "test"

  **QA Scenarios:**
  ```
  Scenario: Encryption roundtrip
    Tool: vitest
    Steps: 1. encryptForUser("sk-test-key", "user_abc") 2. decryptForUser(result, "user_abc") 3. Assert === "sk-test-key"
    Evidence: .sisyphus/evidence/task-4-crypto-roundtrip.txt

  Scenario: Cross-user isolation
    Tool: vitest
    Steps: 1. encrypt same value for user_a and user_b 2. Assert ciphertexts differ 3. Assert decryptForUser(cipher_a, "user_b") throws
    Evidence: .sisyphus/evidence/task-4-crypto-isolation.txt
  ```

  **Commit**: `feat(crypto): add Web Crypto AES-GCM encryption utility` | Files: lib/crypto.ts

---

- [ ] 5. Multi-Provider AI Client

  **What to do**:
  - Create `lib/ai-client.ts` with a unified interface:
    - `type AIProvider = 'gemini' | 'claude' | 'qwen'`
    - `type AIRequest = { provider: AIProvider; apiKey: string; model?: string; systemPrompt: string; userPrompt: string; maxTokens?: number }`
    - `type AIResponse = { content: string; provider: AIProvider; model: string; tokensUsed?: number }`
    - `async function callAI(request: AIRequest): Promise<AIResponse>`
  - Implement provider-specific HTTP calls:
    - Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with API key in query param
    - Claude: `https://api.anthropic.com/v1/messages` with `x-api-key` header + `anthropic-version: 2023-06-01`
    - Qwen: `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` with Bearer token
  - Default models: gemini-2.0-flash, claude-sonnet-4-20250514, qwen-plus
  - Use `fetch()` (available in CF Workers natively) — no axios/node-fetch
  - Timeout: 60s per request. On timeout, throw typed error.
  - Never log the API key. Redact in error messages.

  **Must NOT do**: No axios/node-fetch. No streaming in v1. No provider beyond Gemini/Claude/Qwen.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 1 | Blocks: T9, T15 | Blocked By: None

  **References**:
  - `lib/github.ts` — existing HTTP client pattern with Octokit (follow error handling style)
  - Gemini API: https://ai.google.dev/gemini-api/docs/text-generation
  - Claude API: https://docs.anthropic.com/en/api/messages
  - `ai-dev-workflow-action` repo `.github/actions/run-ai-orchestrator/action.yml` — existing provider switching logic

  **Acceptance Criteria**:
  - [ ] Exports: AIProvider, AIRequest, AIResponse types + callAI function
  - [ ] Each provider has correct endpoint URL, auth header, request body format
  - [ ] `pnpm build` passes

  **QA Scenarios:**
  ```
  Scenario: callAI builds correct request per provider
    Tool: vitest (unit test with mocked fetch)
    Steps: 1. Mock globalThis.fetch 2. callAI({provider:'gemini', apiKey:'test', ...}) 3. Assert fetch called with correct URL containing API key 4. Repeat for claude (x-api-key header) and qwen (Bearer token)
    Evidence: .sisyphus/evidence/task-5-ai-client-providers.txt

  Scenario: Timeout handling
    Tool: vitest
    Steps: 1. Mock fetch to never resolve 2. callAI with 1s timeout 3. Assert throws timeout error 4. Assert error message does NOT contain apiKey
    Evidence: .sisyphus/evidence/task-5-ai-client-timeout.txt
  ```

  **Commit**: group with T6 | `feat(ai): add multi-provider AI client and prompt templates`

---

- [ ] 6. Prompt Templates Per Phase

  **What to do**:
  - Create `lib/prompts/` directory with:
    - `types.ts` — `type PromptContext = { issue: {title, body, labels}, repo: {fileTree: string[], stack: {...}, recentCommits: {...}[]}, conversationHistory?: Comment[], phase: IssueStatus }`
    - `inception.ts` — system prompt: "You are a senior engineer embedded in this codebase. Ask 2-3 questions that reference specific files/patterns. Do NOT ask generic requirements questions." + user prompt template with context injection
    - `discussion.ts` — system prompt: "Synthesize the conversation thread into a design document. Reference specific files that will be modified."
    - `build.ts` — system prompt: "Generate an implementation plan with file paths, code snippets, and test cases."
    - `review.ts` — system prompt: "Analyze the PR diff. Identify bugs, style issues, and suggest improvements."
    - `done.ts` — system prompt: "Generate concise release notes from the issue thread and PR."
    - `index.ts` — export `getPromptForPhase(phase: IssueStatus, context: PromptContext): {systemPrompt: string, userPrompt: string}`
  - Prompts must include EXPLICIT instruction to reference codebase files by path
  - Prompts must include EXPLICIT instruction to NOT ask generic questions

  **Must NOT do**: No hardcoded repo names. No provider-specific prompt formatting (that's ai-client's job).

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 1 | Blocks: T15 | Blocked By: None

  **References**:
  - `lib/labels.ts` — IssueStatus type to match against
  - `ai-dev-workflow-action` repo `seed/ops/prompts/navratna_orchestrator.md` — existing prompt structure to reference
  - `lib/types.ts` — IssueSummary shape for context type alignment

  **Acceptance Criteria**:
  - [ ] `getPromptForPhase` returns non-empty systemPrompt + userPrompt for all 5 phases
  - [ ] inception prompt contains instruction to reference specific files
  - [ ] No hardcoded repo names in any prompt

  **QA Scenarios:**
  ```
  Scenario: All phases return valid prompts
    Tool: vitest
    Steps: 1. Import getPromptForPhase 2. Call for each phase with mock context 3. Assert systemPrompt.length > 50 and userPrompt.length > 50 for each 4. Assert inception prompt includes "specific files"
    Evidence: .sisyphus/evidence/task-6-prompt-templates.txt
  ```

  **Commit**: group with T5 | `feat(ai): add multi-provider AI client and prompt templates`

---

- [ ] 7. Onboarding State Store

  **What to do**:
  - Create `lib/stores/onboarding-store.ts` (Zustand client store):
    - `type OnboardingStep = 'github_connected' | 'repo_selected' | 'workflow_bootstrapped' | 'keys_configured' | 'done'`
    - State: `{ step: OnboardingStep, completed: boolean, selectedRepos: {owner, repo}[], isLoading: boolean }`
    - Actions: `setStep(step)`, `completeOnboarding()`, `addRepo(owner, repo)`, `removeRepo(owner, repo)`, `setLoading(boolean)`
    - `isOnboardingComplete()` selector
  - Follow exact pattern from `lib/stores/board-store.ts` (create() with set/get)

  **Must NOT do**: No persistence in this store — that's D1's job. This is UI state only.

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 1 | Blocks: T20, T24, T25 | Blocked By: None

  **References**:
  - `lib/stores/board-store.ts` — exact Zustand store pattern to follow ("use client", create(), set/get)
  - `lib/labels.ts` — existing const/type export pattern

  **Acceptance Criteria**:
  - [ ] Exports: useOnboardingStore, OnboardingStep type
  - [ ] All actions callable without error
  - [ ] `pnpm build` passes

  **QA Scenarios:**
  ```
  Scenario: Store state transitions work
    Tool: vitest
    Steps: 1. Import useOnboardingStore 2. Call setStep('repo_selected') 3. Assert getState().step === 'repo_selected' 4. Call completeOnboarding() 5. Assert completed === true
    Evidence: .sisyphus/evidence/task-7-onboarding-store.txt
  ```

  **Commit**: `feat(store): add onboarding state machine store`

---

### Wave 2 — Core APIs (After Wave 1)

- [ ] 8. BYOK Key CRUD API

  **What to do**:
  - Create `app/api/user/keys/route.ts`:
    - `GET` — list user's configured providers (provider name + exists boolean, NOT the keys themselves)
    - `POST` — save new key: receive `{provider, apiKey}`, encrypt via `encryptForUser()`, store in KV via `setUserKey()`, record in D1 `provider_keys` table (provider, created_at — NOT the key)
    - `DELETE` — remove key: receive `{provider}`, delete from KV, delete from D1
  - Auth: require session via `getServerSession(authOptions)`, 401 if not authenticated
  - Create D1 migration `0002_provider_keys.sql`: `provider_keys` (id TEXT PK, user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, created_at TEXT, UNIQUE(user_id, provider))
  - Validation: provider must be one of 'gemini' | 'claude' | 'qwen'
  - Response: never return decrypted keys. GET returns `[{provider: 'gemini', configured: true, createdAt: '...'}]`

  **Must NOT do**: Never return decrypted keys in any response. Never log keys.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 2 | Blocks: T9, T20, T21, T26 | Blocked By: T2, T3, T4

  **References**:
  - `app/api/repos/route.ts` — existing API route pattern (getServerSession, NextResponse.json)
  - `lib/crypto.ts` (Task 4) — encryptForUser/decryptForUser
  - `lib/kv.ts` (Task 3) — setUserKey/getUserKey/deleteUserKey
  - `lib/db.ts` (Task 2) — D1 typed queries
  - `lib/auth.ts` — authOptions for getServerSession

  **Acceptance Criteria**:
  - [ ] POST /api/user/keys with valid provider + key → 201
  - [ ] GET /api/user/keys → 200, response lists providers without keys
  - [ ] DELETE /api/user/keys → 200, key removed from KV and D1
  - [ ] Unauthenticated request → 401

  **QA Scenarios:**
  ```
  Scenario: Full CRUD lifecycle
    Tool: Bash (curl against dev server)
    Steps: 1. POST /api/user/keys {provider:'gemini', apiKey:'sk-test'} with session cookie 2. Assert 201 3. GET /api/user/keys 4. Assert response includes {provider:'gemini', configured:true} and does NOT contain 'sk-test' 5. DELETE /api/user/keys {provider:'gemini'} 6. Assert 200 7. GET again 8. Assert gemini no longer listed
    Evidence: .sisyphus/evidence/task-8-byok-crud.txt

  Scenario: Unauthenticated access denied
    Tool: Bash (curl without session)
    Steps: 1. GET /api/user/keys without cookie 2. Assert 401
    Evidence: .sisyphus/evidence/task-8-byok-unauth.txt
  ```

  **Commit**: group with T9 | `feat(byok): add encrypted key CRUD and validation APIs`

---

- [ ] 9. BYOK Key Validation API

  **What to do**:
  - Create `app/api/user/keys/validate/route.ts`:
    - `POST` — receive `{provider, apiKey}`, make a minimal test call to the provider's API:
      - Gemini: POST models/gemini-2.0-flash:generateContent with 1-token prompt
      - Claude: POST /v1/messages with max_tokens=1
      - Qwen: POST /chat/completions with max_tokens=1
    - Return `{valid: boolean, error?: string, provider: string}`
  - Use `callAI` from lib/ai-client.ts with a minimal prompt ("Say hello")
  - Timeout: 10s for validation call
  - Auth: require session

  **Must NOT do**: Do not save the key here. Do not log the key.

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 2 | Blocks: none | Blocked By: T5, T8

  **References**:
  - `lib/ai-client.ts` (Task 5) — callAI function
  - `app/api/user/keys/route.ts` (Task 8) — auth pattern to follow

  **Acceptance Criteria**:
  - [ ] POST with valid key → `{valid: true}`
  - [ ] POST with invalid key → `{valid: false, error: '...'}`
  - [ ] No key appears in response or logs

  **QA Scenarios:**
  ```
  Scenario: Validation returns valid/invalid correctly
    Tool: Bash (curl)
    Steps: 1. POST /api/user/keys/validate {provider:'gemini', apiKey:'INVALID'} 2. Assert {valid: false} 3. Assert error message present but does NOT contain the API key string
    Evidence: .sisyphus/evidence/task-9-key-validation.txt
  ```

  **Commit**: group with T8 | `feat(byok): add encrypted key CRUD and validation APIs`

---

- [ ] 10. Repo Context Engine API

  **What to do**:
  - Create `app/api/repo/[owner]/[repo]/context/route.ts`:
    - `GET` — returns repo context bundle:
      - `fileTree: string[]` — top 2 levels via GitHub Trees API (`repos.getContent` or `git.getTree` with recursive=false on root, then one level deeper)
      - `stack: { language: string, packageManager?: string, frameworks: string[], testRunner?: string, buildTool?: string }` — detected from manifest files (package.json, Cargo.toml, go.mod, requirements.txt, pom.xml, build.gradle)
      - `recentCommits: {sha, message, author, date}[]` — last 10 commits on default branch
      - `openPRs: {number, title, author}[]` — up to 5 open PRs
  - Stack detection logic: check if specific files exist in root, parse package.json for frameworks (react, next, vue, angular, express), test runners (jest, vitest, mocha), build tools (webpack, vite, turbo)
  - Auth: require session, use user's OAuth token via Octokit
  - Cache: set `Cache-Control: max-age=300` (5 min) — repo context doesn't change fast

  **Must NOT do**: Do not read file contents beyond manifest files. Do not recursively traverse more than 2 levels.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 2 | Blocks: T11 | Blocked By: None (uses existing Octokit)

  **References**:
  - `lib/github.ts` — createUserClient(), withOctokit() pattern for authenticated GitHub calls
  - `lib/repo.ts` — existing fetchFileIfExists pattern for content access
  - `lib/services/repos.ts` — existing repo fetching patterns
  - GitHub Trees API: https://docs.github.com/en/rest/git/trees

  **Acceptance Criteria**:
  - [ ] GET /api/repo/{owner}/{repo}/context → 200 with fileTree, stack, recentCommits, openPRs
  - [ ] stack.language detected correctly for a JS/TS repo
  - [ ] fileTree contains max 2 levels of depth

  **QA Scenarios:**
  ```
  Scenario: Context for a known repo
    Tool: Bash (curl)
    Steps: 1. GET /api/repo/tardis-pro/ai-dev-workflow-action/context 2. Assert 200 3. Assert fileTree is array with entries 4. Assert stack.language present 5. Assert recentCommits is array with <= 10 items
    Evidence: .sisyphus/evidence/task-10-repo-context.txt

  Scenario: Non-existent repo returns 404
    Tool: Bash (curl)
    Steps: 1. GET /api/repo/nonexistent/fake-repo/context 2. Assert 404
    Evidence: .sisyphus/evidence/task-10-repo-context-404.txt
  ```

  **Commit**: group with T11 | `feat(context): add repo context engine and builder`

---

- [ ] 11. Context Builder Service

  **What to do**:
  - Create `lib/context-builder.ts`:
    - `async function buildContextForIssue(octokit: Octokit, owner: string, repo: string, issue: IssueSummary, conversationHistory?: Comment[]): Promise<PromptContext>`
    - Internally calls `/api/repo/{owner}/{repo}/context` (or directly uses Octokit for server-side) to get fileTree, stack, recentCommits
    - Assembles `PromptContext` (from lib/prompts/types.ts) with issue data + repo context + conversation history
    - For inception phase: also identify potentially related files by keyword-matching issue title against fileTree
    - Truncation: if fileTree > 500 entries, truncate to top 2 levels only. If conversation > 20 messages, include only last 15.

  **Must NOT do**: No AI calls in this module. No caching (caller handles that).

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 2 | Blocks: T15, T17 | Blocked By: T10

  **References**:
  - `lib/prompts/types.ts` (Task 6) — PromptContext type to build
  - `lib/types.ts` — IssueSummary, CompareSummary shapes
  - `lib/repo.ts` — existing repo helper patterns (fetchFileIfExists, detectIssueBranch)
  - `lib/github.ts` — Octokit access pattern

  **Acceptance Criteria**:
  - [ ] buildContextForIssue returns valid PromptContext with all required fields populated
  - [ ] fileTree truncated to 500 max entries
  - [ ] Related files identified from issue title keywords

  **QA Scenarios:**
  ```
  Scenario: Builds context with all fields
    Tool: vitest
    Steps: 1. Mock Octokit responses for tree, commits, PRs 2. Call buildContextForIssue 3. Assert result has fileTree (array), stack (object with language), recentCommits (array), issue (object)
    Evidence: .sisyphus/evidence/task-11-context-builder.txt
  ```

  **Commit**: group with T10 | `feat(context): add repo context engine and builder`

---

- [ ] 12. Bootstrap API (Labels + Workflow PR)

  **What to do**:
  - Create `app/api/bootstrap/route.ts`:
    - `POST` with body `{owner, repo}`:
      1. Create DevFlow labels via `issues.createLabel()`: status:inception (color: 1d76db), status:discussion (0e8a16), status:build (fbca04), status:review (d93f0b), status:done (6f42c1), feature (0075ca), bugfix (d73a4a), refactor (e4e669), docs (0e8a16), chore (bfdadc)
      2. Check if `.github/workflows/devflow.yml` exists via `repos.getContent()`
      3. If not: create branch `setup/devflow` from default branch, commit `devflow.yml` template (reusable workflow caller pointing to `tardis-pro/ai-dev-workflow-action`), create PR
      4. Return `{labels_created: number, labels_skipped: number, pr_url?: string, already_bootstrapped: boolean}`
    - IDEMPOTENT: if label already exists, skip it (catch 422). If PR already open, return existing PR URL.
  - Auth: require session, use user's OAuth token
  - Record bootstrap status in D1 `user_repos.bootstrapped = 1`

  **Must NOT do**: Do not force-push. Do not delete existing labels. Do not modify existing workflows.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 2 | Blocks: T20, T27 | Blocked By: T2

  **References**:
  - `lib/github.ts` — createUserClient() for authenticated Octokit
  - `app/api/issues/[number]/move/route.ts` — existing label manipulation pattern
  - `ai-dev-workflow-action` repo `scripts/bootstrap.sh` — label names, colors, and workflow template content
  - `ai-dev-workflow-action` repo `examples/workflows/devflow-gemini.yml` — exact YAML for the committed workflow file

  **Acceptance Criteria**:
  - [ ] POST /api/bootstrap {owner, repo} → 201 with labels_created count
  - [ ] Labels exist on GitHub repo after call
  - [ ] Second call is idempotent: labels_skipped = N, no duplicate PR
  - [ ] `user_repos.bootstrapped` set to 1 in D1

  **QA Scenarios:**
  ```
  Scenario: Bootstrap creates labels and PR
    Tool: Bash (curl)
    Steps: 1. POST /api/bootstrap {owner:'test-org', repo:'test-repo'} 2. Assert 201 3. Assert labels_created > 0 4. Assert pr_url present
    Evidence: .sisyphus/evidence/task-12-bootstrap.txt

  Scenario: Bootstrap is idempotent on re-run
    Tool: Bash (curl)
    Steps: 1. POST /api/bootstrap same repo again 2. Assert labels_skipped > 0, labels_created = 0 3. Assert already_bootstrapped = true or same pr_url
    Evidence: .sisyphus/evidence/task-12-bootstrap-idempotent.txt
  ```

  **Commit**: `feat(bootstrap): add one-click repo bootstrap API`

---

- [ ] 13. D1 User/Repo Management Service

  **What to do**:
  - Create `lib/services/user.ts`:
    - `upsertUser(githubId, login, email, avatarUrl): Promise<User>` — insert or update user on sign-in
    - `getUserByGithubId(githubId): Promise<User | null>`
    - `addUserRepo(userId, owner, repo): Promise<void>`
    - `getUserRepos(userId): Promise<UserRepo[]>`
    - `removeUserRepo(userId, owner, repo): Promise<void>`
    - `getOnboardingState(userId): Promise<OnboardingState>`
    - `updateOnboardingState(userId, step): Promise<void>`
  - All queries use D1 via `lib/db.ts`, all scoped by userId
  - Wire `upsertUser` into NextAuth `jwt` callback in `lib/auth.ts` — on sign-in, upsert user to D1

  **Must NOT do**: No user deletion. No admin APIs.

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 2 | Blocks: T21, T24, T25 | Blocked By: T2

  **References**:
  - `lib/db.ts` (Task 2) — D1 query pattern
  - `lib/services/issues.ts` — existing service layer pattern (fetchIssueSummaries)
  - `lib/services/repos.ts` — existing repo service pattern
  - `lib/auth.ts` — NextAuth callbacks where upsertUser should be called

  **Acceptance Criteria**:
  - [ ] All functions exported and type-safe
  - [ ] upsertUser creates on first call, updates on second
  - [ ] All queries include user_id in WHERE

  **QA Scenarios:**
  ```
  Scenario: User CRUD lifecycle
    Tool: vitest with D1 mock
    Steps: 1. upsertUser('gh_123', 'testuser', 'test@email.com', 'url') 2. getUserByGithubId('gh_123') 3. Assert returns matching user 4. addUserRepo(userId, 'owner', 'repo') 5. getUserRepos(userId) 6. Assert returns 1 repo
    Evidence: .sisyphus/evidence/task-13-user-service.txt
  ```

  **Commit**: group with T14 | `feat(services): add user service and idempotent comment writer`

---

- [ ] 14. Idempotent Comment Writer Utility

  **What to do**:
  - Create `lib/github-comments.ts`:
    - `type DevFlowComment = { phase: IssueStatus; issueNumber: number; content: string; idempotencyKey: string }`
    - `async function postDevFlowComment(octokit: Octokit, owner: string, repo: string, comment: DevFlowComment): Promise<{id: number, url: string, created: boolean}>`
    - Embed hidden HTML marker in comment body: `<!-- devflow:${idempotencyKey} -->` at the end
    - Before posting: fetch existing comments, check if marker already exists. If yes, return existing comment (created: false).
    - `async function getDevFlowComments(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<{id, author, body, createdAt, isDevFlow: boolean, phase?: string}[]>`
    - Parse comments to identify DevFlow comments vs regular comments

  **Must NOT do**: Do not edit existing comments. Do not delete comments.

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 2 | Blocks: T15, T17, T28 | Blocked By: None

  **References**:
  - `lib/github.ts` — Octokit usage patterns
  - `app/api/pr/[number]/review/gemini/route.ts` — existing comment posting pattern
  - GitHub Issues Comments API: https://docs.github.com/en/rest/issues/comments

  **Acceptance Criteria**:
  - [ ] postDevFlowComment posts comment with hidden marker
  - [ ] Duplicate call with same idempotencyKey returns existing comment, created=false
  - [ ] getDevFlowComments correctly identifies DevFlow vs regular comments

  **QA Scenarios:**
  ```
  Scenario: Idempotent comment posting
    Tool: vitest with mocked Octokit
    Steps: 1. Mock issues.createComment + issues.listComments 2. postDevFlowComment with key 'test-123' 3. Assert comment body contains '<!-- devflow:test-123 -->' 4. Set listComments mock to return that comment 5. postDevFlowComment again with same key 6. Assert created=false, createComment NOT called again
    Evidence: .sisyphus/evidence/task-14-idempotent-comments.txt
  ```

  **Commit**: group with T13 | `feat(services): add user service and idempotent comment writer`

---

### Wave 3 — AI Orchestration (After Wave 2)

- [ ] 15. Replace dispatchOrchestrator → callAIAndComment

  **What to do**:
  - Rewrite `lib/orchestrator.ts`:
    - Remove existing `dispatchOrchestrator()` function entirely
    - Create `async function callAIAndComment(params: {octokit: Octokit, owner: string, repo: string, issue: IssueSummary, phase: IssueStatus, userApiKeys: {provider: AIProvider, apiKey: string}}): Promise<{commentId: number, commentUrl: string}>`
    - Flow: buildContextForIssue() → getPromptForPhase() → callAI() → postDevFlowComment()
    - Idempotency key: `${phase}-${issueNumber}-${Date.now()}` (allows re-trigger but prevents exact duplicates)
    - On AI error: post a comment saying "AI analysis failed: {sanitized error}. You can retry from the DevFlow dashboard."
    - On success: post AI response as markdown comment with phase header (e.g., "## 💡 Inception Analysis")

  **Must NOT do**: No workflow_dispatch. No ops/out file writes. No retry logic (surface error to user).

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 3 | Blocks: T16, T17, T18, T19, T28 | Blocked By: T5, T6, T11, T14

  **References**:
  - `lib/orchestrator.ts` — EXISTING file to rewrite (currently has dispatchOrchestrator)
  - `lib/ai-client.ts` (Task 5) — callAI()
  - `lib/prompts/index.ts` (Task 6) — getPromptForPhase()
  - `lib/context-builder.ts` (Task 11) — buildContextForIssue()
  - `lib/github-comments.ts` (Task 14) — postDevFlowComment()

  **Acceptance Criteria**:
  - [ ] No `dispatchOrchestrator` function exists
  - [ ] `callAIAndComment` exported and typed
  - [ ] Flow: context build → prompt → AI call → comment post
  - [ ] Error case: posts error comment instead of throwing

  **QA Scenarios:**
  ```
  Scenario: callAIAndComment posts AI response as comment
    Tool: vitest with mocked dependencies
    Steps: 1. Mock buildContextForIssue, callAI, postDevFlowComment 2. Call callAIAndComment 3. Assert callAI called with prompts from getPromptForPhase 4. Assert postDevFlowComment called with AI response content 5. Assert returned commentId and commentUrl
    Evidence: .sisyphus/evidence/task-15-orchestrator-rewrite.txt

  Scenario: AI error posts error comment
    Tool: vitest
    Steps: 1. Mock callAI to throw 2. Call callAIAndComment 3. Assert postDevFlowComment called with error message 4. Assert error message does NOT contain API key
    Evidence: .sisyphus/evidence/task-15-orchestrator-error.txt
  ```

  **Commit**: group with T16, T18 | `feat(orchestrator): replace dispatch with direct AI-to-comment`

---

- [ ] 16. Card Move AI Trigger Integration

  **What to do**:
  - Modify the card move flow to use `callAIAndComment` instead of `dispatchOrchestrator`:
    - In the move API route handler, after label swap: fetch user's AI key from KV (decrypt), call `callAIAndComment`
    - If user has no AI key configured for any provider: skip AI call, post informational comment "Configure an AI provider key in DevFlow settings to enable AI analysis"
    - The AI call should be non-blocking from the UI perspective: the move route returns immediately after label swap, AI call happens after (but still in same request — CF Workers keeps the request alive until completion)
  - Update `lib/services/issues.ts` if needed to support the new flow

  **Must NOT do**: No background jobs. No queuing. Keep synchronous in the request.

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 3 | Blocks: T18, T28 | Blocked By: T15

  **References**:
  - `app/api/issues/[number]/move/route.ts` — existing move handler to modify
  - `lib/orchestrator.ts` (Task 15) — callAIAndComment()
  - `lib/kv.ts` (Task 3) — getUserKey for fetching encrypted key
  - `lib/crypto.ts` (Task 4) — decryptForUser for decrypting the key

  **Acceptance Criteria**:
  - [ ] Card move with configured AI key → AI comment appears on issue
  - [ ] Card move without AI key → informational comment posted
  - [ ] Move route still returns success quickly (label swap confirmed)

  **QA Scenarios:**
  ```
  Scenario: Card move triggers AI comment
    Tool: Playwright + curl
    Steps: 1. Ensure test user has AI key configured 2. Move card from inception to discussion via UI 3. Wait 10s 4. Fetch issue comments via GitHub API 5. Assert new DevFlow comment exists with discussion-phase content
    Evidence: .sisyphus/evidence/task-16-card-move-ai.txt
  ```

  **Commit**: group with T15, T18 | `feat(orchestrator): replace dispatch with direct AI-to-comment`

---

- [ ] 17. Conversation Reply API

  **What to do**:
  - Create `app/api/conversation/[number]/reply/route.ts`:
    - `POST` with body `{owner, repo, message}`:
      1. Post user's message as GitHub comment (user's OAuth token)
      2. Fetch full issue comment thread (all comments)
      3. Build context: buildContextForIssue() with conversationHistory
      4. Determine current phase from issue labels
      5. Call AI with full thread context via callAI()
      6. Post AI response as GitHub comment via postDevFlowComment()
      7. Return `{userComment: {id, url}, aiComment: {id, url, content}}`
  - Auth: require session
  - If no AI key configured: return 400 with `{error: 'No AI provider configured'}`

  **Must NOT do**: No streaming. No websockets. Inline request-response only.

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 3 | Blocks: T22 | Blocked By: T11, T14, T15

  **References**:
  - `lib/orchestrator.ts` (Task 15) — callAIAndComment pattern to follow
  - `lib/context-builder.ts` (Task 11) — buildContextForIssue with conversationHistory
  - `lib/github-comments.ts` (Task 14) — postDevFlowComment, getDevFlowComments
  - `app/api/issues/[number]/move/route.ts` — existing route pattern for dynamic params

  **Acceptance Criteria**:
  - [ ] POST /api/conversation/123/reply {message} → 200 with userComment + aiComment
  - [ ] Both comments appear on GitHub issue
  - [ ] AI response references codebase context (not generic)
  - [ ] No AI key → 400

  **QA Scenarios:**
  ```
  Scenario: Reply posts both user and AI comments
    Tool: Bash (curl)
    Steps: 1. POST /api/conversation/123/reply {owner, repo, message:'Should we use JWT or sessions?'} 2. Assert 200 3. Assert response has userComment.url and aiComment.url 4. Fetch issue comments from GitHub 5. Assert both comments exist in order
    Evidence: .sisyphus/evidence/task-17-conversation-reply.txt
  ```

  **Commit**: `feat(conversation): add inline AI reply endpoint`

---

- [ ] 18. Update /api/issues/[number]/move Route

  **What to do**:
  - Modify `app/api/issues/[number]/move/route.ts`:
    - Remove import/call to `dispatchOrchestrator`
    - After label swap: get user's AI key (getUserKey + decryptForUser), if exists call callAIAndComment
    - Use waitUntil pattern if available on CF Workers (ctx.waitUntil) to not block response on AI call
    - Keep existing optimistic update flow intact

  **Must NOT do**: Do not change label swap logic. Do not remove fallback/error handling.

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 3 | Blocks: none | Blocked By: T15, T16

  **References**:
  - `app/api/issues/[number]/move/route.ts` — existing file to modify
  - `lib/orchestrator.ts` (Task 15) — callAIAndComment

  **Acceptance Criteria**:
  - [ ] No import of `dispatchOrchestrator` remains
  - [ ] callAIAndComment called after label swap
  - [ ] Route still returns 200 on successful label swap regardless of AI outcome

  **QA Scenarios:**
  ```
  Scenario: Move route uses new orchestrator
    Tool: Bash (grep + curl)
    Steps: 1. grep app/api/issues/*/move/route.ts for 'dispatchOrchestrator' 2. Assert zero matches 3. grep for 'callAIAndComment' 4. Assert match found
    Evidence: .sisyphus/evidence/task-18-move-route-updated.txt
  ```

  **Commit**: group with T15, T16 | `feat(orchestrator): replace dispatch with direct AI-to-comment`

---

- [ ] 19. Remove Old ArtifactsViewer + dispatchOrchestrator Cleanup

  **What to do**:
  - Search entire codebase for `dispatchOrchestrator` references — remove all
  - Search for `ArtifactsViewer` component usage — remove from IssueDrawer tabs
  - Remove or repurpose `app/api/artifacts/[number]/route.ts` (the ops/out file reader)
  - Remove `lib/fixtures.ts` artifact-related fixture data if no longer needed
  - Update `components/IssueDrawer.tsx` tab list: remove Artifacts tab (Design tab replaces it in Task 23)
  - Run `pnpm build` to verify no broken imports

  **Must NOT do**: Do not remove components/ArtifactsViewer.tsx file itself yet — mark with TODO for removal after Design tab is live.

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 3 | Blocks: none | Blocked By: T15

  **References**:
  - `lib/orchestrator.ts` — verify old function removed
  - `components/IssueDrawer.tsx` — tab configuration
  - `components/ArtifactsViewer.tsx` — understand what it does before removing references
  - `app/api/artifacts/[number]/route.ts` — route to deprecate

  **Acceptance Criteria**:
  - [ ] `grep -r 'dispatchOrchestrator' --include='*.ts' --include='*.tsx'` → zero results
  - [ ] `pnpm build` passes
  - [ ] Artifacts tab removed from IssueDrawer

  **QA Scenarios:**
  ```
  Scenario: No old orchestrator references remain
    Tool: Bash (grep)
    Steps: 1. grep -r 'dispatchOrchestrator' . --include='*.ts' --include='*.tsx' 2. Assert zero matches 3. pnpm build 4. Assert exit 0
    Evidence: .sisyphus/evidence/task-19-cleanup.txt
  ```

  **Commit**: `refactor(cleanup): remove dispatchOrchestrator and ArtifactsViewer refs`

---

### Wave 4 — UI (After Waves 2-3)

- [ ] 20. Onboarding Wizard Page

  **What to do**:
  - Create `app/onboarding/page.tsx` — multi-step wizard with 4 screens:
    - **Step 1: Connected** — show GitHub avatar/name from session, confirm permissions (repo, workflow, issues)
    - **Step 2: Select Repos** — fetch repos via existing `/api/repos`, multi-select checklist, "Add custom repo" option
    - **Step 3: Bootstrap** — for each selected repo, show bootstrap status. "Bootstrap" button calls `/api/bootstrap`. Show label creation progress + PR link.
    - **Step 4: AI Keys** — inline BYOK form: provider dropdown (Gemini/Claude/Qwen), API key input, "Validate" button, "Save" button. "Skip for now" option.
  - Use `useOnboardingStore` for step tracking
  - Call `updateOnboardingState()` (lib/services/user.ts) on each step completion
  - Create `app/onboarding/layout.tsx` with minimal chrome (no board sidebar/topbar)
  - Responsive: works on mobile
  - Use existing shadcn/ui components (Button, Input, Label, Card, Tabs)

  **Must NOT do**: No custom CSS animations. No autoplaying videos/tutorials. Keep it functional.

  **Recommended Agent Profile**: `visual-engineering` | Skills: [`frontend-design-system`]

  **Parallelization**: Wave 4 | Blocks: T24 | Blocked By: T7, T8, T12

  **References**:
  - `components/RepoPicker.tsx` — existing repo selection UI pattern
  - `components/ui/` — shadcn/ui components available
  - `lib/stores/onboarding-store.ts` (Task 7) — step state
  - `lib/services/user.ts` (Task 13) — updateOnboardingState
  - `app/api/bootstrap/route.ts` (Task 12) — bootstrap endpoint
  - `app/api/user/keys/route.ts` (Task 8) — key save endpoint

  **Acceptance Criteria**:
  - [ ] All 4 steps render and navigate correctly
  - [ ] Step 2 loads repos from API
  - [ ] Step 3 bootstrap button triggers API and shows progress
  - [ ] Step 4 key save works (or skip works)
  - [ ] Onboarding state persisted to D1 after each step

  **QA Scenarios:**
  ```
  Scenario: Complete onboarding flow
    Tool: Playwright
    Steps: 1. Navigate to /onboarding 2. Assert step 1 shows GitHub user info 3. Click Next 4. Assert step 2 shows repo list 5. Select a repo, click Next 6. Assert step 3 shows bootstrap button 7. Click Skip on step 4 8. Assert redirected to / (board)
    Evidence: .sisyphus/evidence/task-20-onboarding-wizard.png
  ```

  **Commit**: group with T24 | `feat(onboarding): add wizard UI and redirect logic`

---

- [ ] 21. Settings Page

  **What to do**:
  - Create `app/settings/page.tsx` with tabbed layout:
    - **AI Keys tab**: list configured providers, add/validate/delete keys. Use `/api/user/keys` and `/api/user/keys/validate`.
    - **Repos tab**: list tracked repos, bootstrap status per repo, remove repo button. Use `getUserRepos()` + `/api/bootstrap`.
    - **Workflow tab**: default AI provider selector, default model, branch prefix. Store in D1 user prefs (extend schema if needed).
  - Create `app/settings/layout.tsx` with sidebar navigation matching board layout
  - Add "Settings" link to Topbar (gear icon)
  - All data fetched client-side via SWR or direct fetch (no server components needed)

  **Must NOT do**: No billing page. No user deletion. No export/import.

  **Recommended Agent Profile**: `visual-engineering` | Skills: [`frontend-design-system`]

  **Parallelization**: Wave 4 | Blocks: none | Blocked By: T8, T13

  **References**:
  - `components/Topbar.tsx` — add settings link here
  - `components/ui/` — shadcn components (Tabs, Card, Button, Input, Label)
  - `app/api/user/keys/route.ts` (Task 8) — keys API
  - `app/api/user/keys/validate/route.ts` (Task 9) — validation API
  - `lib/services/user.ts` (Task 13) — getUserRepos

  **Acceptance Criteria**:
  - [ ] Settings page accessible from board
  - [ ] AI Keys tab: add, validate, delete keys
  - [ ] Repos tab: shows repos with bootstrap status

  **QA Scenarios:**
  ```
  Scenario: Settings key management
    Tool: Playwright
    Steps: 1. Navigate to /settings 2. Click AI Keys tab 3. Select Gemini provider 4. Enter test key 5. Click Validate 6. Assert validation result shown 7. Click Save 8. Assert Gemini shows as configured
    Evidence: .sisyphus/evidence/task-21-settings-page.png
  ```

  **Commit**: group with T25 | `feat(settings): add settings page and topbar updates`

---

- [ ] 22. Design Chat Component

  **What to do**:
  - Create `components/DesignChat.tsx`:
    - Renders GitHub issue comments as a chat interface
    - DevFlow AI comments styled as bot messages (distinct avatar/background)
    - Regular comments styled as user messages
    - Fetches comments via `getDevFlowComments` or direct GitHub API
    - Reply input at bottom: textarea + Send button
    - On Send: call `/api/conversation/[number]/reply` with message, show loading spinner, append both user + AI comments to thread on completion
    - Markdown rendering for AI responses (use existing `react-markdown` + `rehype-highlight` from project deps)
    - Auto-scroll to latest message
    - Show issue status badge (inception/discussion/etc.) at top

  **Must NOT do**: No websockets. No streaming render. No message editing/deletion.

  **Recommended Agent Profile**: `visual-engineering` | Skills: [`frontend-design-system`]

  **Parallelization**: Wave 4 | Blocks: T23 | Blocked By: T17

  **References**:
  - `components/IssueDrawer.tsx` — existing drawer component this will be embedded in
  - `lib/github-comments.ts` (Task 14) — getDevFlowComments for fetching
  - `app/api/conversation/[number]/reply/route.ts` (Task 17) — reply endpoint
  - `react-markdown` + `rehype-highlight` — already in package.json deps
  - `components/ui/` — ScrollArea, Button, Avatar components

  **Acceptance Criteria**:
  - [ ] Comments render as chat bubbles (bot vs user styled differently)
  - [ ] Reply sends message and shows AI response
  - [ ] Markdown rendered correctly in AI responses
  - [ ] Loading state during AI response

  **QA Scenarios:**
  ```
  Scenario: Design chat sends and receives
    Tool: Playwright
    Steps: 1. Open issue drawer 2. Click Design tab 3. Type message in reply input 4. Click Send 5. Assert loading spinner appears 6. Wait for response (up to 60s) 7. Assert user message appears 8. Assert AI response appears below with bot styling 9. Assert markdown is rendered (code blocks, headers)
    Evidence: .sisyphus/evidence/task-22-design-chat.png
  ```

  **Commit**: group with T23 | `feat(design-chat): add Design tab with conversational AI`

---

- [ ] 23. IssueDrawer Design Tab Integration

  **What to do**:
  - Modify `components/IssueDrawer.tsx`:
    - Add "Design" tab (first position, before Diff/PR/Checks)
    - Tab visible when issue has status `inception` or `discussion` (conditionally)
    - Tab renders `<DesignChat issueNumber={issue.number} owner={owner} repo={repo} />`
    - Auto-select Design tab when issue is in inception/discussion phase
    - Other tabs (Diff, PR, Checks) remain unchanged

  **Must NOT do**: Do not modify other tabs. Do not change drawer sizing.

  **Recommended Agent Profile**: `visual-engineering` | Skills: [`frontend-design-system`]

  **Parallelization**: Wave 4 | Blocks: none | Blocked By: T22

  **References**:
  - `components/IssueDrawer.tsx` — existing tab structure to modify
  - `components/DesignChat.tsx` (Task 22) — component to embed
  - `@radix-ui/react-tabs` — existing tab system used

  **Acceptance Criteria**:
  - [ ] Design tab visible for inception/discussion issues
  - [ ] Design tab hidden for build/review/done issues
  - [ ] Tab auto-selected for inception issues
  - [ ] Other tabs unaffected

  **QA Scenarios:**
  ```
  Scenario: Design tab conditional visibility
    Tool: Playwright
    Steps: 1. Open inception issue drawer 2. Assert Design tab visible and selected 3. Close drawer 4. Open a 'build' status issue 5. Assert Design tab NOT visible
    Evidence: .sisyphus/evidence/task-23-design-tab.png
  ```

  **Commit**: group with T22 | `feat(design-chat): add Design tab with conversational AI`

---

- [ ] 24. Onboarding Redirect Logic

  **What to do**:
  - Modify `app/page.tsx`:
    - After session check: fetch onboarding state via `getOnboardingState(userId)`
    - If `!completed`: redirect to `/onboarding`
    - If completed: render board as normal
  - Modify `app/onboarding/page.tsx`: if already completed, redirect to `/`
  - Handle edge case: user signs out and signs back in — check D1, don't re-onboard

  **Must NOT do**: No middleware-based redirects (keep it simple in page.tsx).

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 4 | Blocks: none | Blocked By: T7, T13, T20

  **References**:
  - `app/page.tsx` — existing session check and repo loading logic
  - `lib/services/user.ts` (Task 13) — getOnboardingState

  **Acceptance Criteria**:
  - [ ] New user sign-in → redirected to /onboarding
  - [ ] Completed user → sees board directly
  - [ ] Onboarding page redirects to / if already completed

  **QA Scenarios:**
  ```
  Scenario: Redirect logic
    Tool: Playwright
    Steps: 1. Sign in as new user (no D1 record) 2. Assert redirected to /onboarding 3. Complete onboarding 4. Navigate to / 5. Assert board renders, NOT /onboarding
    Evidence: .sisyphus/evidence/task-24-redirect.png
  ```

  **Commit**: group with T20 | `feat(onboarding): add wizard UI and redirect logic`

---

- [ ] 25. Update Topbar + RepoPicker for Onboarding State

  **What to do**:
  - Modify `components/Topbar.tsx`: add Settings gear icon link to `/settings`
  - Modify `components/RepoPicker.tsx`: show only user's tracked repos (from D1 via getUserRepos) instead of all accessible repos
  - Add "Manage Repos" link in RepoPicker dropdown that goes to /settings?tab=repos
  - Show AI provider indicator: small badge next to repo name showing which AI provider is configured

  **Must NOT do**: Do not change the existing search/filter functionality.

  **Recommended Agent Profile**: `visual-engineering` | Skills: [`frontend-design-system`]

  **Parallelization**: Wave 4 | Blocks: none | Blocked By: T7, T13

  **References**:
  - `components/Topbar.tsx` — existing topbar to modify
  - `components/RepoPicker.tsx` — existing picker to modify
  - `lib/services/user.ts` (Task 13) — getUserRepos
  - `lucide-react` — Settings icon (already in deps)

  **Acceptance Criteria**:
  - [ ] Settings icon visible in topbar, links to /settings
  - [ ] RepoPicker shows only tracked repos
  - [ ] "Manage Repos" link in dropdown

  **QA Scenarios:**
  ```
  Scenario: Topbar + RepoPicker updates
    Tool: Playwright
    Steps: 1. Assert gear icon in topbar 2. Click gear icon 3. Assert navigated to /settings 4. Go back to board 5. Open RepoPicker 6. Assert 'Manage Repos' link visible
    Evidence: .sisyphus/evidence/task-25-topbar-updates.png
  ```

  **Commit**: group with T21 | `feat(settings): add settings page and topbar updates`

---

### Wave 5 — Integration + Security (After Waves 3-4)

- [ ] 26. Encryption Roundtrip + Tenant Isolation Tests

  **What to do**:
  - Create `tests/security/encryption-roundtrip.test.ts`:
    - Test encrypt/decrypt roundtrip with various key lengths and special chars
    - Test cross-user isolation (user A's ciphertext can't be decrypted by user B)
    - Test tampered ciphertext detection (modified base64 fails to decrypt)
  - Create `tests/security/tenant-isolation.test.ts`:
    - Test that all D1 query helpers require userId parameter
    - Test that KV key naming always includes userId prefix
    - Static analysis: grep all .ts files for D1 queries without user_id

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 5 | Blocked By: T1, T4, T8

  **References**: `lib/crypto.ts` (T4), `lib/db.ts` (T2), `lib/kv.ts` (T3)

  **Acceptance Criteria**:
  - [ ] `pnpm vitest run tests/security/` → all pass

  **QA Scenarios:**
  ```
  Scenario: Security test suite passes
    Tool: Bash
    Steps: 1. pnpm vitest run tests/security/ 2. Assert exit 0, all tests pass
    Evidence: .sisyphus/evidence/task-26-security-tests.txt
  ```

  **Commit**: group with T27, T28 | `test(security): add encryption, bootstrap, and comment idempotency tests`

---

- [ ] 27. Bootstrap Idempotency Test

  **What to do**:
  - Create `tests/api/bootstrap-idempotency.test.ts`:
    - Test: first bootstrap creates labels + PR
    - Test: second bootstrap returns same result, creates nothing new
    - Test: bootstrap with already-existing labels skips them gracefully

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 5 | Blocked By: T1, T12

  **References**: `app/api/bootstrap/route.ts` (T12)

  **Acceptance Criteria**:
  - [ ] `pnpm vitest run tests/api/bootstrap-idempotency.test.ts` → pass

  **Commit**: group with T26, T28

---

- [ ] 28. AI Comment Idempotency Test

  **What to do**:
  - Create `tests/api/card-move-ai-comment.test.ts`:
    - Test: callAIAndComment with same idempotency key posts only once
    - Test: postDevFlowComment dedup logic works (marker detection)
    - Test: error response does not contain API key

  **Recommended Agent Profile**: `unspecified-high` | Skills: []

  **Parallelization**: Wave 5 | Blocked By: T1, T15, T16

  **References**: `lib/orchestrator.ts` (T15), `lib/github-comments.ts` (T14)

  **Acceptance Criteria**:
  - [ ] `pnpm vitest run tests/api/card-move-ai-comment.test.ts` → pass

  **Commit**: group with T26, T27

---

- [ ] 29. CF Workers Runtime Compatibility Audit

  **What to do**:
  - Verify all new code works on CF Workers runtime:
    - `lib/crypto.ts` — Web Crypto API available (test with `wrangler dev`)
    - `lib/auth.ts` + NextAuth v4 — JWT strategy works on edge
    - `@octokit/auth-app` — RSA signing works with nodejs_compat
    - All `globalThis.fetch` calls (ai-client.ts) work
    - No Node-only imports (fs, path, child_process, crypto)
  - Run `pnpm cf:build` and verify successful build
  - Run `pnpm cf:dev` and smoke test: sign in, load board, open settings
  - Fix any issues found

  **Recommended Agent Profile**: `deep` | Skills: [`typescript-best-practices`]

  **Parallelization**: Wave 5 | Blocked By: all previous tasks

  **References**: `wrangler.toml`, `open-next.config.ts`, all new lib/*.ts files

  **Acceptance Criteria**:
  - [ ] `pnpm cf:build` → exit 0
  - [ ] `pnpm cf:dev` starts without errors
  - [ ] `grep -r "require('crypto')" lib/` → zero results
  - [ ] `grep -r "require('fs')" lib/` → zero results

  **QA Scenarios:**
  ```
  Scenario: CF Workers build succeeds
    Tool: Bash
    Steps: 1. pnpm cf:build 2. Assert exit 0 3. ls .open-next/worker.js 4. Assert file exists
    Evidence: .sisyphus/evidence/task-29-cf-compat.txt
  ```

  **Commit**: group with T30 | `chore(compat): CF Workers audit and final build verification`

---

- [ ] 30. Full Build + Lint + Type-Check Pass

  **What to do**:
  - Run full verification suite:
    - `pnpm build` — Next.js production build
    - `pnpm lint` — ESLint
    - `pnpm vitest run` — all tests
    - `wrangler d1 migrations apply DB --local` — D1 schema
  - Fix any issues found
  - Final grep audit:
    - Zero `dispatchOrchestrator` references
    - Zero `as any` or `@ts-ignore`
    - Zero `require('crypto')` or `require('fs')` in lib/
    - Zero unencrypted API keys in committed files

  **Recommended Agent Profile**: `quick` | Skills: []

  **Parallelization**: Wave 5 | Blocked By: all previous tasks

  **Acceptance Criteria**:
  - [ ] `pnpm build` → exit 0
  - [ ] `pnpm lint` → exit 0
  - [ ] `pnpm vitest run` → all pass
  - [ ] All grep audits pass

  **QA Scenarios:**
  ```
  Scenario: Full verification suite
    Tool: Bash
    Steps: 1. pnpm build 2. Assert exit 0 3. pnpm lint 4. Assert exit 0 5. pnpm vitest run 6. Assert all pass 7. grep -r 'dispatchOrchestrator' --include='*.ts' 8. Assert zero matches
    Evidence: .sisyphus/evidence/task-30-full-verification.txt
  ```

  **Commit**: group with T29 | `chore(compat): CF Workers audit and final build verification`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns (dispatchOrchestrator calls, ops/out writes, webhook handlers, @ts-ignore, as any). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm build && pnpm lint`. Review all changed/new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic variable names. Verify strict TypeScript — no type assertions.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA Walkthrough** — `unspecified-high` (+ `playwright` skill)
  Start dev server. Walk through: sign in → onboarding wizard (all 4 steps) → board loads → create issue → move to inception → verify AI comment appears → reply in Design tab → verify AI responds → settings page (add/test/delete key). Capture screenshots for each step. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no dispatchOrchestrator, no ops/out writes, no webhooks, no bot account, no retry queue. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit | Message | Pre-commit |
|------|--------|---------|------------|
| 1 | T1 | `chore(test): add vitest infrastructure` | `pnpm build` |
| 1 | T2+T3 | `feat(infra): add CF D1 schema and KV bindings` | `pnpm build` |
| 1 | T4 | `feat(crypto): add Web Crypto AES-GCM encryption utility` | `pnpm build` |
| 1 | T5+T6 | `feat(ai): add multi-provider AI client and prompt templates` | `pnpm build` |
| 1 | T7 | `feat(store): add onboarding state machine store` | `pnpm build` |
| 2 | T8+T9 | `feat(byok): add encrypted key CRUD and validation APIs` | `pnpm build` |
| 2 | T10+T11 | `feat(context): add repo context engine and builder` | `pnpm build` |
| 2 | T12 | `feat(bootstrap): add one-click repo bootstrap API` | `pnpm build` |
| 2 | T13+T14 | `feat(services): add user service and idempotent comment writer` | `pnpm build` |
| 3 | T15+T16+T18 | `feat(orchestrator): replace dispatch with direct AI-to-comment` | `pnpm build` |
| 3 | T17 | `feat(conversation): add inline AI reply endpoint` | `pnpm build` |
| 3 | T19 | `refactor(cleanup): remove dispatchOrchestrator and ArtifactsViewer refs` | `pnpm build` |
| 4 | T20+T24 | `feat(onboarding): add wizard UI and redirect logic` | `pnpm build` |
| 4 | T21+T25 | `feat(settings): add settings page and topbar updates` | `pnpm build` |
| 4 | T22+T23 | `feat(design-chat): add Design tab with conversational AI` | `pnpm build` |
| 5 | T26+T27+T28 | `test(security): add encryption, bootstrap, and comment idempotency tests` | `pnpm build && pnpm vitest run` |
| 5 | T29+T30 | `chore(compat): CF Workers audit and final build verification` | `pnpm build && pnpm lint` |

---

## Success Criteria

### Verification Commands
```bash
pnpm build                    # Expected: exit 0, no errors
pnpm lint                     # Expected: exit 0, no warnings
wrangler d1 migrations apply DB --local  # Expected: all migrations applied
pnpm vitest run               # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" features present and functional
- [ ] All "Must NOT Have" guardrails respected (zero violations)
- [ ] `pnpm build` + `pnpm lint` pass
- [ ] All vitest tests pass
- [ ] D1 migrations apply cleanly
- [ ] No `dispatchOrchestrator` references in codebase
- [ ] No `ops/out/` write paths in codebase
- [ ] No decrypted keys in any log/error output
- [ ] Onboarding wizard completes end-to-end
- [ ] AI comment appears on GitHub issue after card move
- [ ] Design chat reply triggers AI response
- [ ] Settings page manages keys correctly
- [ ] Bootstrap creates labels + PR (idempotent on re-run)
