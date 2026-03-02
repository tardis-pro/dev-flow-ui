import { NextRequest, NextResponse } from "next/server";

// DEPRECATED: This endpoint has been replaced by the AI comment system (DesignChat).
// The artifacts functionality is no longer used. Returns empty array for backward compatibility.
// TODO: Remove this file after DesignChat (Task 22) is live.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const issueNumber = Number.parseInt(number, 10);
  if (!Number.isInteger(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number." }, { status: 400 });
  }

  // Return empty artifacts - this endpoint is deprecated
  return NextResponse.json({ artifacts: [], deprecated: true });
}
