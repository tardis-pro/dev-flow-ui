export type CustomRepo = {
  owner: string;
  name: string;
};

const STORAGE_KEY = "custom_repositories";

export function getCustomRepos(): CustomRepo[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Failed to load custom repositories", error);
    return [];
  }
}

export function addCustomRepo(repo: CustomRepo): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const existing = getCustomRepos();
    const repoKey = `${repo.owner}/${repo.name}`;

    // Check if already exists
    const alreadyExists = existing.some(
      (r) => `${r.owner}/${r.name}` === repoKey
    );

    if (!alreadyExists) {
      existing.push(repo);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (error) {
    console.error("Failed to add custom repository", error);
  }
}

export function removeCustomRepo(owner: string, name: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const existing = getCustomRepos();
    const filtered = existing.filter(
      (r) => !(r.owner === owner && r.name === name)
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to remove custom repository", error);
  }
}
