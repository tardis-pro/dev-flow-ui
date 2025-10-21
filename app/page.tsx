import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { fetchIssueSummaries, groupIssuesByStatus } from "@/lib/services/issues";
import { sampleBoard } from "@/lib/fixtures";
import { Board } from "@/components/Board";
import { Topbar } from "@/components/Topbar";
import { SignInPrompt } from "@/components/SignInPrompt";

type PageProps = {
  searchParams?: Record<string, string | string[]>;
};

export default async function Home({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const env = getEnv();
  const params = searchParams ?? {};

  const ownerParam = typeof params.owner === "string" ? params.owner : env.GITHUB_OWNER;
  const repoParam = typeof params.repo === "string" ? params.repo : env.GITHUB_REPO;
  const owner = ownerParam ?? "tardis-pro";
  const repo = repoParam ?? "navratna";
  const query = typeof params.q === "string" ? params.q : "";
  const initialIssueRaw = typeof params.issue === "string" ? Number.parseInt(params.issue, 10) : NaN;
  const initialIssue = Number.isInteger(initialIssueRaw) ? initialIssueRaw : undefined;

  if (!session) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-8">
        <Topbar owner={owner} repo={repo} repoOptions={[{ owner, repo }]} searchQuery={query} />
        <SignInPrompt />
      </main>
    );
  }

  let columns = sampleBoard();
  let error: string | null = null;

  try {
    const issues = await fetchIssueSummaries({ owner, repo, query });
    columns = groupIssuesByStatus(issues);
  } catch (err) {
    console.error(err);
    error = "Falling back to fixture data. Configure GitHub credentials to see live issues.";
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <Topbar
        owner={owner}
        repo={repo}
        repoOptions={[{ owner, repo }]}
        searchQuery={query}
      />
      {error ? (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}
      <Board
        initialColumns={columns}
        owner={owner}
        repo={repo}
        initialIssueNumber={initialIssue}
      />
    </main>
  );
}
