/**
 * D1 Database types and typed query helpers for DevFlow.
 * ALL queries that touch user-scoped tables are scoped by user_id.
 */

// D1Database type from @cloudflare/workers-types if available, otherwise any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

// Table types
export type User = {
  id: string;
  github_id: string;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserRepo = {
  id: string;
  user_id: string;
  owner: string;
  repo: string;
  bootstrapped: number;
  default_ai_provider: string | null;
  created_at: string;
};

export type OnboardingState = {
  user_id: string;
  step: string;
  completed: number;
  updated_at: string;
};

export type ProviderKey = {
  id: string;
  user_id: string;
  provider: string;
  created_at: string;
};

export type D1Env = { DB: D1Database };

type UpsertUserData = {
  id: string;
  github_id: string;
  github_login: string;
  email?: string | null;
  avatar_url?: string | null;
};

type D1QueryResult<T> = { results: T[]; success: boolean; meta?: unknown };

function createDb(db: D1Database) {
  return {
    // === USER OPERATIONS ===
    async upsertUser(data: UpsertUserData): Promise<void> {
      await db
        .prepare(
          `INSERT INTO users (id, github_id, github_login, email, avatar_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(github_id) DO UPDATE SET
             github_login = excluded.github_login,
             email = COALESCE(excluded.email, email),
             avatar_url = COALESCE(excluded.avatar_url, avatar_url),
             updated_at = datetime('now')`
        )
        .bind(data.id, data.github_id, data.github_login, data.email ?? null, data.avatar_url ?? null)
        .run();
    },

    async getUserByGithubId(githubId: string): Promise<User | null> {
      const result = await db
        .prepare("SELECT * FROM users WHERE github_id = ?")
        .bind(githubId)
        .first() as User | null;
      return result ?? null;
    },

    // === USER REPO OPERATIONS (all scoped by user_id) ===
    async addUserRepo(userId: string, owner: string, repo: string): Promise<void> {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO user_repos (id, user_id, owner, repo, bootstrapped, created_at)
           VALUES (?, ?, ?, ?, 0, datetime('now'))`
        )
        .bind(id, userId, owner, repo)
        .run();
    },

    async getUserRepos(userId: string): Promise<UserRepo[]> {
      const result = await db
        .prepare("SELECT * FROM user_repos WHERE user_id = ? ORDER BY created_at DESC")
        .bind(userId)
        .all() as D1QueryResult<UserRepo>;
      return result.results ?? [];
    },

    async updateUserRepoBootstrapped(userId: string, owner: string, repo: string): Promise<void> {
      await db
        .prepare(
          `UPDATE user_repos SET bootstrapped = 1 WHERE user_id = ? AND owner = ? AND repo = ?`
        )
        .bind(userId, owner, repo)
        .run();
    },

    async removeUserRepo(userId: string, owner: string, repo: string): Promise<void> {
      await db
        .prepare(
          `DELETE FROM user_repos WHERE user_id = ? AND owner = ? AND repo = ?`
        )
        .bind(userId, owner, repo)
        .run();
    },

    // === ONBOARDING STATE OPERATIONS (all scoped by user_id) ===
    async getOnboardingState(userId: string): Promise<OnboardingState | null> {
      const result = await db
        .prepare("SELECT * FROM onboarding_state WHERE user_id = ?")
        .bind(userId)
        .first() as OnboardingState | null;
      return result ?? null;
    },

    async updateOnboardingState(userId: string, step: string, completed = false): Promise<void> {
      await db
        .prepare(
          `INSERT INTO onboarding_state (user_id, step, completed, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             step = excluded.step,
             completed = excluded.completed,
             updated_at = datetime('now')`
        )
        .bind(userId, step, completed ? 1 : 0)
        .run();
    },

    // === PROVIDER KEY OPERATIONS (all scoped by user_id) ===
    // These record metadata about keys stored in KV; actual key values are in KV
    
    async upsertProviderKey(userId: string, provider: string): Promise<void> {
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO provider_keys (id, user_id, provider, created_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, provider) DO UPDATE SET created_at = datetime('now')`
        )
        .bind(id, userId, provider)
        .run();
    },

    async deleteProviderKey(userId: string, provider: string): Promise<void> {
      await db
        .prepare("DELETE FROM provider_keys WHERE user_id = ? AND provider = ?")
        .bind(userId, provider)
        .run();
    },

    async listProviderKeys(userId: string): Promise<ProviderKey[]> {
      const result = await db
        .prepare("SELECT * FROM provider_keys WHERE user_id = ? ORDER BY created_at DESC")
        .bind(userId)
        .all() as D1QueryResult<ProviderKey>;
      return result.results ?? [];
    },
  };
}

/**
 * Get the D1 database query helper (singleton pattern).
 * @param env - Environment with DB binding
 */
export function getDb(env: D1Env): ReturnType<typeof createDb> {
  // Note: We don't cache across different env instances since DB binding may differ
  // This follows a simpler pattern than env.ts since DB is request-scoped
  return createDb(env.DB);
}
