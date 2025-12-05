import { createUserClient } from "@/lib/github";

export type RepoOption = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  description?: string | null;
  language?: string | null;
  stars?: number;
  forks?: number;
  updatedAt?: string;
};

export async function fetchAccessibleRepos(): Promise<RepoOption[]> {
  try {
    const client = await createUserClient();
    const repos = await client.paginate(client.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: "updated",
    });

    const mapped = repos
      .filter((repo) => Boolean(repo.owner?.login))
      .map((repo) => ({
        owner: repo.owner!.login,
        name: repo.name,
        fullName: repo.full_name,
        private: Boolean(repo.private),
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updatedAt: repo.updated_at,
      }));

    const seen = new Set<string>();
    return mapped.filter((repo) => {
      if (seen.has(repo.fullName)) return false;
      seen.add(repo.fullName);
      return true;
    });
  } catch (error) {
    console.error("Failed to load accessible repos", error);
    return [];
  }
}
