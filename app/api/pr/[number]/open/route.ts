import { NextRequest, NextResponse } from "next/server";
import { withOctokit } from "@/lib/github";
import { detectIssueBranch, fetchFileIfExists } from "@/lib/repo";

type OpenPrPayload = {
  owner?: string;
  repo?: string;
  head?: string;
  base?: string;
  title?: string;
  body?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { number: string } },
) {
  const issueNumber = Number.parseInt(params.number, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  let payload: OpenPrPayload = {};
  try {
    if (request.headers.get("content-length") !== "0") {
      payload = (await request.json()) as OpenPrPayload;
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { owner, repo } = payload;
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo must be specified." },
      { status: 400 },
    );
  }

  try {
    const result = await withOctokit({ owner, repo }, async (octokit) => {
      const { data: repository } = await octokit.repos.get({ owner, repo });
      const base = payload.base ?? repository.default_branch;

      const issue = await octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      const statusLabel = issue.data.labels?.find((label) =>
        (typeof label === "string" ? label : label.name)?.startsWith("status:")
      );
      const workType = statusLabel
        ? (typeof statusLabel === "string" ? statusLabel : statusLabel.name)
        : undefined;

      const head =
        payload.head ??
        (await detectIssueBranch(octokit, owner, repo, issueNumber, workType));

      if (!head) {
        throw new Error(
          "Unable to determine branch for PR. Provide 'head' in the request body.",
        );
      }

      const prSummary =
        payload.body ??
        (await fetchFileIfExists(
          octokit,
          owner,
          repo,
          "ops/out/PR_SUMMARY.md",
        ))?.content ??
        "";

      const desiredTitle =
        payload.title ??
        `[${issueNumber}] ${issue.data.title}`.slice(0, 250);

      const fixesLine = `\n\nFixes #${issueNumber}`;
      const bodyCombined = prSummary.includes(`Fixes #${issueNumber}`)
        ? prSummary
        : `${prSummary.trim()}${fixesLine}`;

      const existing = await octokit.pulls.list({
        owner,
        repo,
        head: `${owner}:${head}`,
        state: "open",
      });

      if (existing.data.length) {
        const pr = existing.data[0];
        const updated = await octokit.pulls.update({
          owner,
          repo,
          pull_number: pr.number,
          title: desiredTitle,
          body: bodyCombined,
          base,
        });
        return {
          action: "updated",
          pull: updated.data,
        };
      }

      const created = await octokit.pulls.create({
        owner,
        repo,
        title: desiredTitle,
        body: bodyCombined,
        head,
        base,
      });

      await octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [
          ...((issue.data.labels ?? [])
            .map((label) => (typeof label === "string" ? label : label.name ?? ""))
            .filter((label): label is string => Boolean(label))),
          "status:review",
        ],
      });

      return {
        action: "created",
        pull: created.data,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Failed to open or update pull request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
