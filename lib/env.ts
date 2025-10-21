import { z } from "zod";

const envSchema = z.object({
  NEXTAUTH_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_INSTALLATION_ID: z.string().optional(),
  ORCHESTRATOR_WORKFLOW: z
    .string()
    .default(".github/workflows/devflow.yml")
    .optional(),
});

type Env = z.infer<typeof envSchema>;

let cache: Env | null = null;

export function getEnv(): Env {
  if (!cache) {
    cache = envSchema.parse({
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
      GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      GITHUB_INSTALLATION_ID: process.env.GITHUB_INSTALLATION_ID,
      ORCHESTRATOR_WORKFLOW: process.env.ORCHESTRATOR_WORKFLOW,
    });
  }
  return cache;
}

export function assertEnv(keys: Array<keyof Env>) {
  const env = getEnv();
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
  return env;
}
