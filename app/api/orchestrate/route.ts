import { NextRequest, NextResponse } from "next/server";

// AI orchestration now handled by callAIAndComment in lib/orchestrator.ts
// This endpoint is deprecated - orchestration triggers automatically on card move

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { message: "Orchestration now handled automatically on card move" },
    { status: 200 }
  );
}
