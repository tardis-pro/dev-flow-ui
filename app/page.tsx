import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchIssueSummaries, groupIssuesByStatus } from "@/lib/services/issues";
import { fetchAccessibleRepos } from "@/lib/services/repos";
import { sampleBoard } from "@/lib/fixtures";
import { Board } from "@/components/Board";
import { Topbar } from "@/components/Topbar";
import { SignInPrompt } from "@/components/SignInPrompt";

type SearchParams = Record<string, string | string[]>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

async function resolveSearchParams(input?: SearchParams | Promise<SearchParams>) {
  if (!input) return {} as SearchParams;
  if (typeof (input as Promise<SearchParams>).then === "function") {
    return ((await input) ?? {}) as SearchParams;
  }
  return input ?? {};
}

export default async function Home({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const params = await resolveSearchParams(searchParams);

  const query = typeof params.q === "string" ? params.q : "";
  const initialIssueRaw = typeof params.issue === "string" ? Number.parseInt(params.issue, 10) : NaN;
  const initialIssue = Number.isInteger(initialIssueRaw) ? initialIssueRaw : undefined;

  if (!session) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-8">
        <Topbar repoOptions={[]} searchQuery={query} />
        <SignInPrompt />
      </main>
    );
  }

  const repoOptions = await fetchAccessibleRepos();
  const requestedOwner = typeof params.owner === "string" ? params.owner : undefined;
  const requestedRepo = typeof params.repo === "string" ? params.repo : undefined;

  const selectedRepo = repoOptions.find(
    (repo) => repo.owner === requestedOwner && repo.name === requestedRepo,
  ) ?? repoOptions[0];

  let columns = sampleBoard();
  let error: string | null = null;

  if (selectedRepo) {
    try {
      const issues = await fetchIssueSummaries({
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        query,
      });
      columns = groupIssuesByStatus(issues);
    } catch (err) {
      console.error(err);
      error = "Falling back to fixture data. Configure GitHub credentials to see live issues.";
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <Topbar
        owner={selectedRepo?.owner}
        repo={selectedRepo?.name}
        repoOptions={repoOptions.map((repo) => ({ owner: repo.owner, repo: repo.name }))}
        searchQuery={query}
      />
      {!selectedRepo ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Connect a repository to your GitHub account to begin. Once available, pick it in the top bar to load issues.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          {error}
        </div>
      ) : null}
      {selectedRepo ? (
        <Board
          initialColumns={columns}
          owner={selectedRepo.owner}
          repo={selectedRepo.name}
          initialIssueNumber={initialIssue}
        />
      ) : null}
    </main>
  );
}
