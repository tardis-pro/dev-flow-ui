import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv, NEXTAUTH_SECRET: "test-secret-for-encryption-tests" };
});

afterEach(() => {
  process.env = originalEnv;
});

async function importCrypto() {
  return import("@/lib/crypto");
}

function tamperCiphertext(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Flip a byte in the ciphertext (after the 12-byte IV)
  const tamperIndex = Math.min(14, bytes.length - 1);
  bytes[tamperIndex] ^= 0xff;
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return btoa(result);
}

describe("Encryption Roundtrip", () => {
  it("basic roundtrip - encrypt then decrypt returns original", async () => {
    const { encryptForUser, decryptForUser } = await importCrypto();
    const plaintext = "my-secret-api-key-12345";
    const userId = "user@example.com";

    const ciphertext = await encryptForUser(plaintext, userId);
    const decrypted = await decryptForUser(ciphertext, userId);

    expect(decrypted).toBe(plaintext);
  });

  it("different users get different ciphertext for same plaintext", async () => {
    const { encryptForUser } = await importCrypto();
    const plaintext = "shared-api-key";
    const userA = "alice@example.com";
    const userB = "bob@example.com";

    const ciphertextA = await encryptForUser(plaintext, userA);
    const ciphertextB = await encryptForUser(plaintext, userB);

    expect(ciphertextA).not.toBe(ciphertextB);
  });

  it("User A's ciphertext cannot be decrypted by User B", async () => {
    const { encryptForUser, decryptForUser } = await importCrypto();
    const plaintext = "secret-key-for-alice";
    const userA = "alice@example.com";
    const userB = "bob@example.com";

    const ciphertextA = await encryptForUser(plaintext, userA);

    await expect(decryptForUser(ciphertextA, userB)).rejects.toThrow();
  });

  it("tampered ciphertext fails to decrypt", async () => {
    const { encryptForUser, decryptForUser } = await importCrypto();
    const plaintext = "important-secret";
    const userId = "user@example.com";

    const ciphertext = await encryptForUser(plaintext, userId);
    const tampered = tamperCiphertext(ciphertext);

    await expect(decryptForUser(tampered, userId)).rejects.toThrow();
  });

  it("special characters roundtrip correctly", async () => {
    const { encryptForUser, decryptForUser } = await importCrypto();
    const specialStrings = [
      "hello world with spaces",
      "unicode: 你好世界 🎉 🚀",
      "symbols: !@#$%^&*()_+-=[]{}|;':\",./<>?",
      "newlines:\n\tand\ttabs",
      "emoji-only: 🔐🔑🛡️",
    ];
    const userId = "user@example.com";

    for (const plaintext of specialStrings) {
      const ciphertext = await encryptForUser(plaintext, userId);
      const decrypted = await decryptForUser(ciphertext, userId);
      expect(decrypted).toBe(plaintext);
    }
  });

  it("long API key (512 chars) roundtrip", async () => {
    const { encryptForUser, decryptForUser } = await importCrypto();
    const longKey = "sk-" + "a".repeat(509);
    expect(longKey.length).toBe(512);
    const userId = "user@example.com";

    const ciphertext = await encryptForUser(longKey, userId);
    const decrypted = await decryptForUser(ciphertext, userId);

    expect(decrypted).toBe(longKey);
    expect(decrypted.length).toBe(512);
  });

  it("produces different ciphertext on each encryption (random IV)", async () => {
    const { encryptForUser } = await importCrypto();
    const plaintext = "same-input";
    const userId = "user@example.com";

    const ciphertext1 = await encryptForUser(plaintext, userId);
    const ciphertext2 = await encryptForUser(plaintext, userId);

    expect(ciphertext1).not.toBe(ciphertext2);
  });
});
