
## [T2/T3] D1 + KV Setup

### wrangler version
- wrangler 4.44.0 (update available 4.69.0)

### wrangler.toml additions
```toml
[[d1_databases]]
binding = "DB"
database_name = "devflow-db"
database_id = "local-devflow-db"

[[kv_namespaces]]
binding = "USER_KEYS"
id = "local-user-keys-id"
```

### migrations directory
- `migrations/0001_initial.sql` - 3 tables: users, user_repos, onboarding_state
- `migrations/0002_provider_keys.sql` - 1 table: provider_keys

### lib/db.ts
- Types: User, UserRepo, OnboardingState, ProviderKey, D1Env
- `getDb(env)` returns typed query helper with methods:
  - upsertUser, getUserByGithubId, addUserRepo, getUserRepos, updateUserRepoBootstrapped
  - getOnboardingState, updateOnboardingState
  - upsertProviderKey, deleteProviderKey, listProviderKeys
- ALL queries scoped by user_id

### lib/kv.ts
- Types: KVEnv
- Functions: getUserKey, setUserKey, deleteUserKey, listUserKeyProviders
- Key naming: `{userId}:{provider}`
- Values pre-encrypted (no encryption/decryption in this module)

### Local development
- Migrations applied: `pnpm exec wrangler d1 migrations apply DB --local`
  - Local D1 database created at `.wrangler/state/v3/d1/minifile`
  - SQLite files in `.wrangler/state/v3/d1` can be inspected locally

### Build verification
- `pnpm build` passes
  - LSP diagnostics clean on all changed files

### Production deployment notes
- Replace `local-devflow-db` with production database ID when creating Cloudflare D1 database
- Replace `local-user-keys-id` with production KV namespace ID
- All D1 queries use `user_id` filter for security
- ID generation uses `crypto.randomUUID()` (Web Crypto API)

### Type patterns
- `unknown` used for external types (D1Database, KVNamespace) with ESL disable comment
- `lib/db.ts`: Uses `any` type with eslint-disable directive
- `lib/kv.ts`: Uses `unknown` type (works well)
- Type casting for D1 results (not generic type arguments)
- Key naming: `{userId}:{provider}`
- Singleton pattern in `getDb` avoids overhead

### Design decisions
- No ORM used (direct D1 API)
- No encryption in lib/kv.ts (values pre-encrypted)
- No data seeding
- All queries scoped by user_id for security


## 2026-03-02 Session Init

### Codebase Conventions
- **Store pattern**: `"use client"` at top, `create<State>((set, get) => ({...}))` from zustand. See `lib/stores/board-store.ts`.
- **IssueStatus type**: `"inception" | "discussion" | "build" | "review" | "done"` from `lib/labels.ts`. ISSUE_STATUSES const array.
- **TSConfig paths**: `@/*` → `./*` (project root). All imports use `@/lib/...`, `@/components/...`.
- **Octokit pattern**: `createUserClient()` for OAuth token, `createInstallationClient()` for GitHub App. `withOctokit()` convenience wrapper. File: `lib/github.ts`.
- **Env pattern**: Zod-validated singleton via `getEnv()`. Cache on first call. File: `lib/env.ts`.
- **API route pattern**: `getServerSession(authOptions)` for auth check, `NextResponse.json()` for response.
- **Error handling**: Try/catch with console.warn for non-critical fallbacks (see lib/github.ts lines 143-145).

### CF Workers Constraints
- `nodejs_compat` flag is already set in `wrangler.toml` — Node built-ins work but Web Crypto preferred for new code
- `globalThis.crypto.subtle` for encryption — NOT `import crypto from 'crypto'`
- `fetch()` is native in CF Workers — no axios/node-fetch needed
- No filesystem access
- Deployed as `code` worker at `code.tardis.digital`

### Package Manager
- Uses `pnpm` (pnpm-lock.yaml exists)
- Also has `bun.lock` — bun is available for running scripts

### Existing deps (relevant)
- next 15.5.6, react 19.1.0, next-auth 4.24.11
- @octokit/rest, @octokit/auth-app, @octokit/plugin-paginate-rest, @octokit/plugin-throttling
- zustand 5.0.8, zod 4.1.12
- react-markdown, rehype-highlight, rehype-raw, remark-gfm (for MD rendering)
- sonner (toast), framer-motion, @hello-pangea/dnd (drag-drop)
- shadcn/ui via @radix-ui/* components
- lucide-react for icons

### Buffer usage in github.ts
- Line 48: `Buffer.from(base64, "base64")` — using Node Buffer for private key decode
- This works with nodejs_compat — but new code should avoid Buffer where possible


### AI Client (lib/ai-client.ts)
- **Multi-provider pattern**: Single `callAI()` function handles gemini/claude/qwen with provider-specific configs
- **API key security**: Never include apiKey in error messages; use `throw new AIError(message, provider, statusCode)`
- **Timeout pattern**: `AbortController` with `setTimeout(abort, 60_000)` in try/finally block
- **Provider endpoints**:
  - Gemini: `generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  - Claude: `api.anthropic.com/v1/messages` with `x-api-key` header
  - Qwen: `dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` with Bearer auth
- **Default models**: gemini-2.0-flash, claude-sonnet-4-20250514, qwen-plus
- **Error handling**: Custom `AIError` class with provider and statusCode fields; re-throw AIError, wrap others
- **Response parsing**: Provider-specific parseResponse functions handle response shape differences
- **No external deps**: Uses native `fetch()` only — compatible with CF Workers


## [T1] Vitest Setup
- vitest version: 3.2.4
- Config: vitest.config.ts uses resolve.alias for @/* path mapping (mirrors tsconfig)
- Test dir: tests/ with subdirs security/, api/, services/ (placeholder .gitkeep)
- Scripts: `pnpm test` (vitest run), `pnpm test:watch` (vitest watch)
- Smoke test imports from @/lib/labels to verify path resolution

## 2026-03-02 Task 6 — lib/prompts/ Phase Templates

### Prompt Architecture
- `lib/prompts/types.ts` — shared types: `PromptContext`, `PhasePrompt`, `RepoStack`, `RepoContext`, `ConversationMessage`
- `lib/prompts/{phase}.ts` — one function per phase: `getInceptionPrompt`, `getDiscussionPrompt`, `getBuildPrompt`, `getReviewPrompt`, `getDonePrompt`
- `lib/prompts/index.ts` — `getPromptForPhase(phase: IssueStatus, context: PromptContext): PhasePrompt` switch dispatcher

### PromptContext Shape
- `context.issue` — number, title, body, labels[]
- `context.repo` — owner, name, fileTree (string[]), stack (RepoStack), recentCommits, openPRs
- `context.conversationHistory?` — ConversationMessage[] with role 'user'|'ai'
- `context.phase` — IssueStatus

### Design Decisions
- fileTree is sliced to 100 items for inception, 80 for discussion/build to keep prompts under 8K tokens
- Inception prompt requires file-specific questions — forbidden generic questions listed explicitly in system prompt
- Build prompt extracts designDoc from last AI message in conversationHistory
- Review prompt is system-prompt heavy (sets reviewer mindset) — actual diff comes from external source
- Done prompt is minimal: 1-2 sentence changelog entry, factual, past-tense

### Pre-existing Build Failures (unrelated to this task)
- `lib/db.ts` — `any` type, unused vars, prefer-const
- `lib/kv.ts` — `any` type
All 7 new prompt files: zero LSP diagnostics
## [T7] Onboarding Store
- File: lib/stores/onboarding-store.ts
- Pattern: matches board-store.ts exactly
- OnboardingStep values: github_connected | repo_selected | workflow_bootstrapped | keys_configured | done
- Key distinction: UI state only (no persistence) — D1 persistence is handled by lib/services/user.ts
- Actions: setStep, completeOnboarding, addRepo, removeRepo, setLoading, isOnboardingComplete, reset

## [T4] lib/crypto.ts — Web Crypto Utility
- **Exports**: `deriveKey`, `encrypt`, `decrypt`, `encryptForUser`, `decryptForUser`
- **Algorithm**: PBKDF2 (100k iterations, SHA-256) → AES-GCM 256-bit
- **IV**: Random 12 bytes per encryption, prepended to ciphertext
- **Encoding**: base64 via `btoa`/`atob` (CF Workers compatible)
- **No Node deps**: Uses `globalThis.crypto.subtle` only — no `import crypto` or `Buffer`
- **TypeScript quirk**: `Uint8Array` from `TextEncoder.encode()` needs `as BufferSource` cast for Web Crypto APIs
- **Cross-user isolation**: Different userId salts produce different derived keys — decryption throws `OperationError` if key mismatch
- **Secret source**: `process.env.NEXTAUTH_SECRET ?? 'devflow-dev-secret'`
- **Evidence**: `.sisyphus/evidence/task-4-crypto-roundtrip.txt`

## [T13] lib/services/user.ts — D1 User Service

### Service Pattern
- File: lib/services/user.ts
- All 7 functions take `env: D1Env` as first param, delegate to `getDb(env)` from lib/db.ts
- `upsertUser`: calls `db.upsertUser()` then `db.getUserByGithubId()` to return the full User row; throws if still null
- `updateOnboardingState`: calls `db.updateOnboardingState(userId, step)` — 3rd param `completed` defaults to false in db layer

### lib/db.ts Extension
- Added `removeUserRepo(userId, owner, repo)` method using: `DELETE FROM user_repos WHERE user_id = ? AND owner = ? AND repo = ?`
- Pattern: always scope DELETE by user_id first

### NextAuth JWT Callback — CF Workers Constraint
- CF D1 bindings are NOT accessible inside NextAuth callbacks (they run in a different context)
- Solution: store GitHub profile data in the JWT token on sign-in
  - `token.githubId`, `token.login`, `token.avatarUrl` set when `account?.provider === "github" && profile` is truthy
- API route handlers (which do have CF env) can then call `upsertUser()` using these token fields
- GitHub provider's profile shape: `{ id: number, login: string, avatar_url: string }` — cast inline with literal type shape
- `account` is ONLY non-null on the initial sign-in, so the guard `if (account && profile)` correctly fires once

## [T14] lib/github-comments.ts — Idempotent Comment Writer

### Pattern: Hidden HTML marker for idempotency
- Marker format: `<!-- devflow:{idempotencyKey} -->` appended to comment body
- Idempotency key format: `{phase}-{issueNumber}-{timestamp}`
- listComments (per_page: 100) checked before createComment
- Duplicate key returns `{id, url, created: false}` — no new comment posted

### API surface
- `postDevFlowComment(octokit, owner, repo, DevFlowComment) → Promise<PostedComment>`
- `getDevFlowComments(octokit, owner, repo, issueNumber) → Promise<CommentSummary[]>`
- `CommentSummary.isDevFlow: boolean` — true if marker present in body
- `CommentSummary.phase?: string` — extracted from key's first segment

### Octokit REST calls used
- `octokit.rest.issues.listComments({ owner, repo, issue_number, per_page: 100 })`
- `octokit.rest.issues.createComment({ owner, repo, issue_number, body })`

### Vitest mock pattern for Octokit
```typescript
const listComments = vi.fn().mockResolvedValue({ data: existingComments });
const octokit = { rest: { issues: { listComments, createComment } } } as unknown as Octokit;
```

### Build quirk: pre-existing `.next/export` ENOTEMPTY
- If build fails with `ENOTEMPTY rmdir .next/export`, run `rm -rf .next` first
- Not caused by new code — transient FS state from previous partial builds

## [T9] BYOK Key Validation API — app/api/user/keys/validate/route.ts
- **Route**: POST /api/user/keys/validate
- **Auth**: getServerSession(authOptions) → 401
- **Body validation**: `'provider' in body && 'apiKey' in body` pattern (no zod needed for simple checks)
- **Provider guard**: `ReadonlyArray<AIProvider>.includes(value)` after string check — no type assertions
- **Validation via callAI()**: minimal prompt (maxTokens: 10) to minimize cost; callAI has built-in 60s timeout
- **Error sanitization**: `message.split(apiKey).join("[REDACTED]")` — safer than regex for keys with special chars
- **Return 200 for invalid key**: returns `{valid: false, error, provider}` with HTTP 200 (not 4xx) since it's a valid business operation
- **Stale .next cache gotcha**: `rm -rf .next` required before build when route files have changed; .next/types caches route types and stale cache causes phantom TypeScript errors

## [T10] Repo Context Engine API
- **File**: `app/api/repo/[owner]/[repo]/context/route.ts`
- **Dynamic route params**: `Promise<{ owner: string; repo: string }>` — params is a Promise in Next.js 15, must await it
- **GitHub Trees API**: Use `octokit.git.getTree()` with `recursive: "false"` for flat listing, then fetch subdirectories separately for level 2
- **Stack detection pattern**: Check root manifest files → detect language; check lock files → detect packageManager;parse package.json → extract frameworks/testRunner/buildTool
- **Package.json parsing**: Buffer.from(content, "base64") to decode GitHub API file content
- **Cache headers**: Set via `NextResponse.json(response, { headers: { "Cache-Control": "max-age=300" } })`
- **Error pattern**: 404 from GitHub repos.get → return 404; catch other GitHub errors and re-throw
- **Reuses existing types**: `RepoStack`, `RecentCommit` from `lib/prompts/types.ts`
