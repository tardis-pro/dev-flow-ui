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
    async jwt({ token, account }) {
      if (account?.provider === "github" && account.access_token) {
        token.accessToken = account.access_token;
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
