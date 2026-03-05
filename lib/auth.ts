import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_OAUTH_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: [
            "read:user",
            "user:email",
            "repo",
            "workflow",
            "read:org", // Add org read permission
          ].join(" "),
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && account.access_token) {
        token.accessToken = account.access_token;
      }
      // Store GitHub identity in the JWT so API routes (with CF D1 access) can upsert the user.
      // account is only non-null on the initial sign-in event.
      if (account?.provider === "github" && profile) {
        const githubProfile = profile as {
          id?: number | string;
          login?: string;
          avatar_url?: string;
        };
        token.githubId = String(githubProfile.id ?? "");
        token.login = githubProfile.login ?? "";
        token.avatarUrl = githubProfile.avatar_url ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.accessToken && session.user) {
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
};
