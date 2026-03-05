import { getDb, type D1Env, type User, type UserRepo, type OnboardingState } from "@/lib/db";
import type { Session } from "next-auth";

export async function resolveUserId(session: Session | null, env: D1Env): Promise<string | null> {
  const githubId = session?.githubId;
  if (!githubId) return null;
  const login = session?.login ?? session?.user?.name ?? "";
  const email = session?.user?.email ?? null;
  const avatarUrl = session?.avatarUrl ?? session?.user?.image ?? null;
  const user = await upsertUser(env, githubId, login, email, avatarUrl);
  return user.id;
}

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

export async function getUserByGithubId(
  env: D1Env,
  githubId: string,
): Promise<User | null> {
  const db = getDb(env);
  return db.getUserByGithubId(githubId);
}

export async function addUserRepo(
  env: D1Env,
  userId: string,
  owner: string,
  repo: string,
): Promise<void> {
  const db = getDb(env);
  await db.addUserRepo(userId, owner, repo);
}

export async function getUserRepos(
  env: D1Env,
  userId: string,
): Promise<UserRepo[]> {
  const db = getDb(env);
  return db.getUserRepos(userId);
}

export async function removeUserRepo(
  env: D1Env,
  userId: string,
  owner: string,
  repo: string,
): Promise<void> {
  const db = getDb(env);
  await db.removeUserRepo(userId, owner, repo);
}

export async function getOnboardingState(
  env: D1Env,
  userId: string,
): Promise<OnboardingState | null> {
  const db = getDb(env);
  return db.getOnboardingState(userId);
}

export async function updateOnboardingState(
  env: D1Env,
  userId: string,
  step: string,
): Promise<void> {
  const db = getDb(env);
  await db.updateOnboardingState(userId, step);
}
