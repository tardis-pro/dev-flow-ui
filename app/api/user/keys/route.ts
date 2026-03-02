/**
 * BYOK (Bring Your Own Key) CRUD API
 * Manages user-provided API keys for AI providers (gemini, claude, qwen).
 * Keys are encrypted before storage in KV; only metadata is stored in D1.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authOptions } from "@/lib/auth";
import { encryptForUser } from "@/lib/crypto";
import { setUserKey, deleteUserKey, type KVEnv } from "@/lib/kv";
import { getDb, type D1Env } from "@/lib/db";

// Valid AI providers for BYOK
const VALID_PROVIDERS = ["gemini", "claude", "qwen"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(provider: string): provider is Provider {
  return VALID_PROVIDERS.includes(provider as Provider);
}

export const runtime = "nodejs";

/**
 * GET /api/user/keys
 * Returns list of configured providers (NEVER the actual keys).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.email;
    const { env } = getCloudflareContext();
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

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.email;
    const body = await request.json();

    // Validate request body
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

    // Validate provider
    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate apiKey is not empty
    if (!apiKey.trim()) {
      return NextResponse.json(
        { error: "API key cannot be empty" },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();

    // Encrypt the API key for this user
    const encryptedKey = await encryptForUser(apiKey, userId);

    // Store encrypted key in KV
    await setUserKey(env as KVEnv, userId, provider, encryptedKey);

    // Record metadata in D1
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

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.email;
    const body = await request.json();

    // Validate request body
    if (
      typeof body !== "object" ||
      body === null ||
      typeof body.provider !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid request body. Required: { provider: string }" },
        { status: 400 }
      );
    }

    const { provider } = body;

    // Validate provider
    if (!isValidProvider(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();

    // Delete from KV
    await deleteUserKey(env as KVEnv, userId, provider);

    // Delete metadata from D1
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
