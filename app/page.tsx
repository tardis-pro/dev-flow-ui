import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchIssueSummaries, groupIssuesByStatus } from "@/lib/services/issues";
import { fetchAccessibleRepos } from "@/lib/services/repos";
import { sampleBoard } from "@/lib/fixtures";
import { MainContent } from "@/components/MainContent";
import { Topbar } from "@/components/Topbar";
import { SignInPrompt } from "@/components/SignInPrompt";

type SearchParams = Record<string, string | string[]>;

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

async function resolveSearchParams(input?: Promise<SearchParams>) {
  return (await input) ?? {};
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
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <MainContent
        initialRepoOptions={repoOptions.map((repo) => ({ owner: repo.owner, repo: repo.name }))}
        initialColumns={columns}
        owner={requestedOwner}
        repo={requestedRepo}
        searchQuery={query}
        initialIssue={initialIssue}
      />
    </main>
  );
}
