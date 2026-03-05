/**
 * KV Namespace typed accessor for user provider keys.
 * Keys are stored pre-encrypted — this module does NOT handle encryption/decryption.
 * Key naming convention: {userId}:{provider}
 */

// KVNamespace type from @cloudflare/workers-types if available, otherwise any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KVNamespace = any;

export type KVEnv = { USER_KEYS: KVNamespace };

/**
 * Build the KV key for a user's provider key.
 */
function buildKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

/**
 * Get a user's encrypted provider key from KV.
 * @returns The encrypted key string, or null if not found
 */
export async function getUserKey(
  env: KVEnv,
  userId: string,
  provider: string
): Promise<string | null> {
  const key = buildKey(userId, provider);
  return env.USER_KEYS.get(key);
}

/**
 * Store a user's encrypted provider key in KV.
 * @param encryptedValue - Pre-encrypted key value (encryption handled by caller)
 */
export async function setUserKey(
  env: KVEnv,
  userId: string,
  provider: string,
  encryptedValue: string
): Promise<void> {
  const key = buildKey(userId, provider);
  await env.USER_KEYS.put(key, encryptedValue);
}

/**
 * Delete a user's provider key from KV.
 */
export async function deleteUserKey(
  env: KVEnv,
  userId: string,
  provider: string
): Promise<void> {
  const key = buildKey(userId, provider);
  await env.USER_KEYS.delete(key);
}

/**
 * List all provider names that have keys for a given user.
 * @returns Array of provider names (e.g., ["openai", "anthropic"])
 */
export async function listUserKeyProviders(
  env: KVEnv,
  userId: string
): Promise<string[]> {
  // List keys with prefix "{userId}:"
  const prefix = `${userId}:`;
  const result = await env.USER_KEYS.list({ prefix });
  
  // Extract provider names from keys
  const providers: string[] = [];
  if (result.keys) {
    for (const key of result.keys) {
      // Key format: {userId}:{provider}
      const keyName = key.name as string;
      if (keyName.startsWith(prefix)) {
        const provider = keyName.slice(prefix.length);
        if (provider) {
          providers.push(provider);
        }
      }
    }
  }
  
  return providers;
}
