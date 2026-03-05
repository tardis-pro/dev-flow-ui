=== Test Evidence ===
# Learnings

## Encryption Roundtrip Tests

- Use dynamic imports for `vi.resetModules()` to reset module state for each test
- Tests must to be isolated ( can't share state between tests
- Use `afterEach` to clean up process.env changes

- AES-GCM encryption uses PBKDF2 key derivation with user-specific salt
- Different IVs for different ciphertext for same plaintext
- Tampering detection: AES-GCM authentication tag catches tampering
- Long strings (512 chars) work correctly

- Unicode and special characters roundtrip correctly

- Empty strings are handled properly

- Different keys per user produce different ciphertext (tenant isolation)

- AES-GCM with per-user salt ensures tenant isolation
- KV key format: `{userId}:{provider}``
- D1 queries: All use parameterized queries with user_id binding
- Static analysis: verified all queries include user_id in WHERE clause and binding
- All tables have user_id constraints:- Mock pattern: Use `vi.fn()` with in-memory stores
- Pattern from existing tests: `tests/services/orchestrator.test.ts` and `github-comments.test.ts`

- Zero `as any` or `@ts-ignore` in new test files
- All mocking done at module level with `vi.mock()`
- Idempotency testing: postDevFlowComment checks for existing marker before creating
- Error sanitization: sanitizeError() removes API key from error messages

- getDevFlowComments: filters comments by DevFlow marker
- Phase extraction from idempotency key

# Learnings
## Test patterns from existing tests
- Use dynamic imports (`vi.resetModules()`) to reset module state for each test
- Tests need isolation - can't share state between tests
- Use `afterEach` to clean up `process.env` changes
- Mock pattern: Create in-memory stores with `vi.fn()` for KV mock

- Mock pattern: Create mock Octokit with chainable mock functions
- Pattern: All queries use `bind()` for user_id

- Zero `as any` or `@ts-ignore` in new test files
- All mocking done at module level with `vi.mock()`
- Evidence saved to: `.sisyphus/evidence/task-26-28-security-tests.txt`
