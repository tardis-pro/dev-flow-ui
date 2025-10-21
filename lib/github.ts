import { Octokit } from "@octokit/rest";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { throttling } from "@octokit/plugin-throttling";
import { createAppAuth } from "@octokit/auth-app";
import type { EndpointOptions } from "@octokit/types";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";

const BaseOctokit = Octokit.plugin(paginateRest, throttling);

const THROTTLE_OPTIONS = {
  onRateLimit: (
    retryAfter: number,
    options: EndpointOptions,
    octokit: InstanceType<typeof BaseOctokit>,
    retryCount: number,
  ) => {
    void octokit;
    if (retryCount < 2) {
      console.warn(
        `Request quota exhausted for request ${options.method} ${options.url}. Retrying in ${retryAfter} seconds.`,
      );
      return true;
    }
    return false;
  },
  onSecondaryRateLimit: (
    retryAfter: number,
    options: EndpointOptions,
    octokit: InstanceType<typeof BaseOctokit>,
  ) => {
    void octokit;
    console.warn(
      `Secondary rate limit triggered for request ${options.method} ${options.url}.`,
    );
    return true;
  },
};

type AuthenticatedOctokit = InstanceType<typeof BaseOctokit>;

const env = getEnv();

function decodePrivateKey(base64?: string) {
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

type AppAuthOptions = Parameters<typeof createAppAuth>[0];

function createOctokit(auth: string | AppAuthOptions) {
  if (typeof auth === "string") {
    return new BaseOctokit({
      auth,
      throttle: THROTTLE_OPTIONS as never,
    });
  }
  return new BaseOctokit({
    authStrategy: createAppAuth,
    auth,
    throttle: THROTTLE_OPTIONS as never,
  });
}

let appClient: AuthenticatedOctokit | null = null;

function getAppClient() {
  if (appClient) return appClient;
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    return null;
  }
  const privateKey = decodePrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  if (!privateKey) {
    throw new Error("Unable to decode GITHUB_APP_PRIVATE_KEY. Ensure it is base64 encoded.");
  }
  appClient = createOctokit({
    appId: env.GITHUB_APP_ID,
    privateKey,
  });
  return appClient;
}

export async function createInstallationClient(params: {
  owner: string;
  repo: string;
  installationId?: number;
}) {
  const client = getAppClient();
  if (!client) return null;
  const installationId =
    params.installationId ??
    (env.GITHUB_INSTALLATION_ID
      ? Number.parseInt(env.GITHUB_INSTALLATION_ID, 10)
      : undefined) ??
    (await fetchInstallationId(client, params.owner, params.repo));
  if (!installationId) {
    throw new Error(
      `Unable to resolve GitHub App installation for ${params.owner}/${params.repo}`,
    );
  }
  const tokenResponse = await client.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  return createOctokit(tokenResponse.data.token);
}

async function fetchInstallationId(
  client: AuthenticatedOctokit,
  owner: string,
  repo: string,
) {
  const { data } = await client.apps.getRepoInstallation({ owner, repo });
  return data.id;
}

export async function createUserClient() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    throw new Error("User authentication required.");
  }
  return createOctokit(session.accessToken);
}

export async function getOctokitForRequest(params: {
  owner: string;
  repo: string;
  prefer?: "installation" | "user";
}) {
  if (params.prefer !== "user") {
    try {
      const client = await createInstallationClient({
        owner: params.owner,
        repo: params.repo,
      });
      if (client) {
        return { client, authType: "installation" as const };
      }
    } catch (error) {
      console.warn("Falling back to user token", error);
    }
  }

  const userClient = await createUserClient();
  return { client: userClient, authType: "user" as const };
}

export async function withOctokit<T>(
  params: {
    owner: string;
    repo: string;
    prefer?: "installation" | "user";
  },
  handler: (client: AuthenticatedOctokit, owner: string, repo: string) => Promise<T>,
): Promise<T> {
  const { client } = await getOctokitForRequest({
    owner: params.owner,
    repo: params.repo,
    prefer: params.prefer,
  });
  return handler(client, params.owner, params.repo);
}

export type { AuthenticatedOctokit };
