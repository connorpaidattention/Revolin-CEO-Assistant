/**
 * MCP Google Workspace tool integration.
 *
 * Uses @ai-sdk/mcp to connect to a Google Workspace MCP server
 * and expose its tools (Drive, Gmail, Calendar, Sheets) to streamText.
 */

import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

const MCP_TIMEOUT_MS = 10_000;

let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

/**
 * Get MCP tools from the Google Workspace MCP server.
 * Returns an empty object if MCP is not configured.
 * Lazily initializes and caches the MCP client.
 */
export async function getMcpTools(): Promise<Record<string, unknown>> {
  const url = process.env.MCP_GOOGLE_WORKSPACE_URL;
  if (!url) return {};

  try {
    if (!mcpClient) {
      mcpClient = await Promise.race([
        createMCPClient({
          transport: {
            type: "sse",
            url,
            headers: process.env.MCP_AUTH_TOKEN
              ? { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` }
              : undefined,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("MCP client connection timed out")),
            MCP_TIMEOUT_MS
          )
        ),
      ]);
    }

    return await mcpClient.tools();
  } catch (err) {
    console.error("[mcp] Failed to get MCP tools:", err);
    mcpClient = null;
    return {};
  }
}

/**
 * Check if the MCP client can connect and return tools.
 * Returns true if healthy, false otherwise.
 */
export async function checkMcpHealth(): Promise<boolean> {
  const url = process.env.MCP_GOOGLE_WORKSPACE_URL;
  if (!url) return false;

  try {
    const tools = await getMcpTools();
    return Object.keys(tools).length > 0;
  } catch {
    return false;
  }
}

/**
 * Close the MCP client connection (for cleanup).
 */
export async function closeMcpClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}
