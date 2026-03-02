/**
 * D1 user/repo management service.
 * All functions take a D1Env as first param and are scoped by user_id.
 * NOTE: These functions require CF bindings (D1) and must be called from
 * API routes, not NextAuth callbacks.
 */

import { getDb, type D1Env, type User, type UserRepo, type OnboardingState } from "@/lib/db";

/**
 * Upsert a GitHub user into D1.
 * Generates a UUID for new users; on conflict updates login/email/avatarUrl.
 */
export async function upsertUser(
  env: D1Env,
  githubId: string,
  login: string,
  email: string | null,
  avatarUrl: string | null,
): Promise<User> {
  const db = getDb(env);
  const id = crypto.randomUUID();
  await db.upsertUser({
    id,
    github_id: githubId,
    github_login: login,
    email,
    avatar_url: avatarUrl,
  });
  const user = await db.getUserByGithubId(githubId);
  if (!user) {
    throw new Error(`Failed to upsert user with githubId ${githubId}`);
  }
  return user;
}

/**
 * Look up a user by their GitHub ID. Returns null if not found.
 */
export async function getUserByGithubId(
  env: D1Env,
  githubId: string,
): Promise<User | null> {
  const db = getDb(env);
  return db.getUserByGithubId(githubId);
}

/**
 * Add a GitHub repo to the user's tracked repos list.
 */
export async function addUserRepo(
  env: D1Env,
  userId: string,
  owner: string,
  repo: string,
): Promise<void> {
  const db = getDb(env);
  await db.addUserRepo(userId, owner, repo);
}

/**
 * Get all repos tracked by a user, ordered by created_at DESC.
 */
export async function getUserRepos(
  env: D1Env,
  userId: string,
): Promise<UserRepo[]> {
  const db = getDb(env);
  return db.getUserRepos(userId);
}

/**
 * Remove a repo from the user's tracked repos list.
 */
export async function removeUserRepo(
  env: D1Env,
  userId: string,
  owner: string,
  repo: string,
): Promise<void> {
  const db = getDb(env);
  await db.removeUserRepo(userId, owner, repo);
}

/**
 * Get the onboarding state for a user. Returns null if not yet started.
 */
export async function getOnboardingState(
  env: D1Env,
  userId: string,
): Promise<OnboardingState | null> {
  const db = getDb(env);
  return db.getOnboardingState(userId);
}

/**
 * Update (or create) the onboarding step for a user.
 */
export async function updateOnboardingState(
  env: D1Env,
  userId: string,
  step: string,
): Promise<void> {
  const db = getDb(env);
  await db.updateOnboardingState(userId, step);
}
