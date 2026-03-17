import { NextResponse } from "next/server";
import { checkDb } from "@/lib/db/pool";
import { isMcpConfigured, PRIMARY_MODEL_ID } from "@/lib/ai/provider";
import { checkMcpHealth } from "@/lib/ai/mcp-tools";
import type { StatusResponse } from "@/lib/types";

let cachedMcpStatus: "connected" | "disconnected" | "not_configured" =
  "not_configured";
let mcpStatusCheckedAt = 0;
const MCP_CACHE_TTL_MS = 60_000;

export async function GET() {
  const dbConnected = await checkDb();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // MCP status: cache for 60s to keep /api/status fast
  let mcpStatus: "connected" | "disconnected" | "not_configured";
  if (!isMcpConfigured()) {
    mcpStatus = "not_configured";
  } else if (Date.now() - mcpStatusCheckedAt < MCP_CACHE_TTL_MS) {
    mcpStatus = cachedMcpStatus;
  } else {
    const healthy = await checkMcpHealth();
    mcpStatus = healthy ? "connected" : "disconnected";
    cachedMcpStatus = mcpStatus;
    mcpStatusCheckedAt = Date.now();
  }

  const status: StatusResponse = {
    status: dbConnected && hasApiKey ? "ok" : "error",
    anthropic: hasApiKey ? "configured" : "missing",
    mcp: mcpStatus,
    model: PRIMARY_MODEL_ID,
    database: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(status);
}
