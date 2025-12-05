import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchAccessibleRepos } from "@/lib/services/repos";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repos = await fetchAccessibleRepos();

    return NextResponse.json({
      repos: repos.map((r) => ({ owner: r.owner, repo: r.name })),
    });
  } catch (error) {
    console.error("Failed to fetch repos:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
