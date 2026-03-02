import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserKey, setUserKey, deleteUserKey, listUserKeyProviders } from "@/lib/kv";
import type { KVEnv } from "@/lib/kv";
import * as fs from "fs";
import * as path from "path";

// Helper to create an in-memory mock KV namespace
function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix?: string }) => {
      const allKeys = Array.from(store.keys());
      const filtered = options?.prefix
        ? allKeys.filter((k) => k.startsWith(options.prefix!))
        : allKeys;
      return {
        keys: filtered.map((name) => ({ name })),
        list_complete: true,
        cursor: "",
      };
    }),
    getWithMetadata: vi.fn(async (key: string) => ({
      value: store.get(key) ?? null,
      metadata: null,
    })),
  };
}

describe("Tenant Isolation — KV key naming", () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let env: KVEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKV = createMockKV();
    env = { USER_KEYS: mockKV as unknown as KVNamespace };
  });

  it("KV key naming always includes userId prefix", async () => {
    const userId1 = "user@a.com";
    const userId2 = "user@b.com";
    const provider = "gemini";

    await setUserKey(env, userId1, provider, "encrypted-value-1");
    expect(mockKV.put).toHaveBeenCalledWith(`${userId1}:${provider}`, "encrypted-value-1");

    await setUserKey(env, userId2, provider, "encrypted-value-2");
    expect(mockKV.put).toHaveBeenCalledWith(`${userId2}:${provider}`, "encrypted-value-2");

    const key1 = `${userId1}:${provider}`;
    const key2 = `${userId2}:${provider}`;
    expect(key1).not.toBe(key2);
  });

  it("getUserKey returns null for non-existent key", async () => {
    const result = await getUserKey(env, "nonexistent@user.com", "openai");
    expect(result).toBeNull();
  });

  it("getUserKey returns value for existing key", async () => {
    await setUserKey(env, "user@example.com", "claude", "encrypted-claude-key");
    const result = await getUserKey(env, "user@example.com", "claude");
    expect(result).toBe("encrypted-claude-key");
  });

  it("deleteUserKey removes the correct key", async () => {
    await setUserKey(env, "user@example.com", "qwen", "encrypted-qwen-key");
    await deleteUserKey(env, "user@example.com", "qwen");

    expect(mockKV.delete).toHaveBeenCalledWith("user@example.com:qwen");

    const result = await getUserKey(env, "user@example.com", "qwen");
    expect(result).toBeNull();
  });

  it("listUserKeyProviders returns only providers for specified user", async () => {
    await setUserKey(env, "user1@a.com", "gemini", "enc1");
    await setUserKey(env, "user1@a.com", "claude", "enc2");
    await setUserKey(env, "user1@a.com", "openai", "enc3");
    await setUserKey(env, "user2@b.com", "gemini", "enc4");

    const providers = await listUserKeyProviders(env, "user1@a.com");

    expect(providers).toHaveLength(3);
    expect(providers).toContain("gemini");
    expect(providers).toContain("claude");
    expect(providers).toContain("openai");
    expect(providers).not.toContain("user2@b.com:gemini");
  });

  it("user A's keys are not accessible by user B", async () => {
    await setUserKey(env, "alice@example.com", "gemini", "alice-encrypted-key");

    // Bob should not be able to get Alice's key
    const bobResult = await getUserKey(env, "bob@example.com", "gemini");
    expect(bobResult).toBeNull();

    // Alice can still get her own key
    const aliceResult = await getUserKey(env, "alice@example.com", "gemini");
    expect(aliceResult).toBe("alice-encrypted-key");
  });
});

describe("Tenant Isolation — Static analysis of db.ts", () => {
  it("all user-scoped table queries include user_id binding", () => {
    const dbPath = path.join(process.cwd(), "lib", "db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");

    const userScopedTables = ["user_repos", "onboarding_state", "provider_keys"];

    for (const table of userScopedTables) {
      // Find all SQL query strings that reference this table
      const queryPattern = new RegExp(
        `["'\`]([^"'\`]*(?:SELECT|INSERT|UPDATE|DELETE)[^"'\`]*${table}[^"'\`]*)["'\`]`,
        "gi"
      );
      const matches = content.match(queryPattern) ?? [];

      for (const match of matches) {
        const hasUserId =
          match.toLowerCase().includes("user_id") ||
          match.includes("WHERE user_id");

        expect(
          hasUserId,
          `Query for table "${table}" should include user_id scoping. Found: ${match.substring(0, 120)}`
        ).toBe(true);
      }
    }
  });

  it("no raw SQL queries without user_id in lib/db.ts", () => {
    const dbPath = path.join(process.cwd(), "lib", "db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");

    // Check that SELECT queries on user tables always have WHERE user_id
    const selectWithoutUserId = /SELECT\s+\*\s+FROM\s+(user_repos|onboarding_state|provider_keys)\s+(?!WHERE\s+user_id)/gi;
    const matches = content.match(selectWithoutUserId) ?? [];

    expect(
      matches.length,
      `Found SELECT queries without user_id scoping: ${matches.join(", ")}`
    ).toBe(0);
  });
});
