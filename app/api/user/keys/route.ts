/**
 * BYOK (Bring Your Own Key) CRUD API
 * Manages user-provided API keys for AI providers (gemini, claude, qwen).
 * Keys are encrypted before storage in KV; only metadata is stored in D1.
 */

import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authOptions } from "@/lib/auth";
import { encryptForUser } from "@/lib/crypto";
import { setUserKey, deleteUserKey, type KVEnv } from "@/lib/kv";
import { getDb, type D1Env } from "@/lib/db";
import { upsertUser } from "@/lib/services/user";

// Valid AI providers for BYOK
const VALID_PROVIDERS = ["gemini", "claude", "qwen", "glm", "minimax", "mercury"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(provider: string): provider is Provider {
  return VALID_PROVIDERS.includes(provider as Provider);
}

export const runtime = "nodejs";

/**
 * GET /api/user/keys
 * Returns list of configured providers (NEVER the actual keys).
 */
async function resolveUserId(session: Session | null, env: D1Env): Promise<string | null> {
  const githubId = session?.githubId;
  const login = session?.login ?? session?.user?.name ?? "";
  const email = session?.user?.email ?? null;
  const avatarUrl = session?.avatarUrl ?? session?.user?.image ?? null;
  if (!githubId) return null;
  const user = await upsertUser(env, githubId, login, email, avatarUrl);
  return user.id;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.githubId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { env } = getCloudflareContext();
    const userId = await resolveUserId(session, env as D1Env);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb(env as D1Env);
    const providerKeys = await db.listProviderKeys(userId);

    // Return only metadata — NEVER the actual keys
    const keys = providerKeys.map((pk) => ({
      provider: pk.provider,
      configured: true,
      createdAt: pk.created_at,
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Failed to list provider keys:", error);
    return NextResponse.json(
      { error: "Failed to list provider keys" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/keys
 * Stores an encrypted API key for a provider.
 * Body: { provider: string, apiKey: string }
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.githubId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      typeof body.provider !== "string" ||
      typeof body.apiKey !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid request body. Required: { provider: string, apiKey: string }" },
        { status: 400 }
      );
    }

    const { provider, apiKey } = body;

    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!apiKey.trim()) {
      return NextResponse.json({ error: "API key cannot be empty" }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const userId = await resolveUserId(session, env as D1Env);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const encryptedKey = await encryptForUser(apiKey, userId);
    await setUserKey(env as KVEnv, userId, provider, encryptedKey);

    const db = getDb(env as D1Env);
    await db.upsertProviderKey(userId, provider);

    return NextResponse.json({ success: true, provider }, { status: 201 });
  } catch (error) {
    console.error("Failed to store provider key:", error);
    return NextResponse.json(
      { error: "Failed to store provider key" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/keys
 * Removes an API key for a provider.
 * Body: { provider: string }
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.githubId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (typeof body !== "object" || body === null || typeof body.provider !== "string") {
      return NextResponse.json(
        { error: "Invalid request body. Required: { provider: string }" },
        { status: 400 }
      );
    }

    const { provider } = body;

    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();
    const userId = await resolveUserId(session, env as D1Env);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await deleteUserKey(env as KVEnv, userId, provider);

    const db = getDb(env as D1Env);
    await db.deleteProviderKey(userId, provider);

    return NextResponse.json({ success: true, provider });
  } catch (error) {
    console.error("Failed to delete provider key:", error);
    return NextResponse.json(
      { error: "Failed to delete provider key" },
      { status: 500 }
    );
  }
}
