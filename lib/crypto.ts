/**
 * Web Crypto AES-GCM encryption/decryption utilities.
 * Uses globalThis.crypto.subtle (CF Workers compatible).
 * No Node.js crypto or Buffer imports.
 */

const PBKDF2_ITERATIONS = 100000;
const IV_LENGTH = 12; // 12 bytes for AES-GCM

/**
 * Encodes a string to Uint8Array using TextEncoder.
 */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Decodes a Uint8Array to string using TextDecoder.
 */
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Converts a Uint8Array to base64 string.
 * Uses btoa for CF Workers compatibility.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts a base64 string to Uint8Array.
 * Uses atob for CF Workers compatibility.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives an AES-GCM CryptoKey from a secret + userId salt using PBKDF2.
 * The secret should be NEXTAUTH_SECRET from env.
 * Per-user salt ensures different users get different derived keys.
 */
export async function deriveKey(secret: string, userId: string): Promise<CryptoKey> {
  // Import the secret as raw key material for PBKDF2
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    encode(secret) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Derive the AES-GCM key using PBKDF2
  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encode(userId) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return derivedKey;
}

/**
 * Encrypts plaintext using AES-GCM with a random 12-byte IV.
 * Returns base64-encoded string: iv (12 bytes) || ciphertext || auth tag
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  // Generate random IV
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Encrypt the plaintext
  const encodedPlaintext = encode(plaintext);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPlaintext as BufferSource
  );

  // Concatenate IV and ciphertext
  const ciphertextBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(IV_LENGTH + ciphertextBytes.length);
  combined.set(iv, 0);
  combined.set(ciphertextBytes, IV_LENGTH);

  // Return as base64
  return uint8ArrayToBase64(combined);
}

/**
 * Decrypts AES-GCM ciphertext. Input is base64 string from encrypt().
 */
export async function decrypt(ciphertext: string, key: CryptoKey): Promise<string> {
  // Decode from base64
  const combined = base64ToUint8Array(ciphertext);

  // Extract IV (first 12 bytes) and ciphertext (rest)
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertextBytes = combined.slice(IV_LENGTH);

  // Decrypt
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertextBytes as BufferSource
  );

  return decode(new Uint8Array(decrypted));
}

/**
 * Convenience: derive key for userId then encrypt.
 * Uses NEXTAUTH_SECRET from process.env (fallback: 'devflow-dev-secret').
 */
export async function encryptForUser(plaintext: string, userId: string): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? "devflow-dev-secret";
  const key = await deriveKey(secret, userId);
  return encrypt(plaintext, key);
}

/**
 * Convenience: derive key for userId then decrypt.
 */
export async function decryptForUser(ciphertext: string, userId: string): Promise<string> {
  const secret = process.env.NEXTAUTH_SECRET ?? "devflow-dev-secret";
  const key = await deriveKey(secret, userId);
  return decrypt(ciphertext, key);
}
