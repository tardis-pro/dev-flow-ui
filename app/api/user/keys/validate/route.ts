import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callAI, AIProvider } from "@/lib/ai-client";

export const runtime = "nodejs";

const ALLOWED_PROVIDERS: ReadonlyArray<AIProvider> = ["gemini", "claude", "qwen"] as const;

function isAllowedProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && (ALLOWED_PROVIDERS as ReadonlyArray<string>).includes(value);
}

function sanitizeError(message: string, apiKey: string): string {
  if (!apiKey) return message;
  return message.split(apiKey).join("[REDACTED]");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("provider" in body) ||
    !("apiKey" in body)
  ) {
    return NextResponse.json(
      { error: "Request body must include provider and apiKey" },
      { status: 400 }
    );
  }

  const { provider, apiKey } = body as Record<string, unknown>;

  if (!isAllowedProvider(provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${ALLOWED_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return NextResponse.json(
      { error: "apiKey must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    await callAI({
      provider,
      apiKey,
      systemPrompt: "You are a test assistant.",
      userPrompt: "Say hello in one word.",
      maxTokens: 10,
    });

    return NextResponse.json({ valid: true, provider });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const sanitizedMessage = sanitizeError(rawMessage, apiKey);

    return NextResponse.json(
      { valid: false, error: sanitizedMessage, provider },
      { status: 200 }
    );
  }
}
