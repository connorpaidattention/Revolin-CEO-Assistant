# MCP Google Workspace — Deployment Guide

## Overview

Hugh Assistant supports Google Workspace integration (Gmail, Calendar, Drive, Sheets) via MCP (Model Context Protocol). The MCP server runs as a separate service and exposes Google APIs as tools that Claude can call.

## Architecture

Two MCP approaches are wired in the codebase:

1. **SDK Client (SSE)** — `src/lib/ai/mcp-tools.ts`
   - Next.js server connects to the MCP server via Server-Sent Events
   - Tools are proxied through the app server
   - Works with private/internal MCP servers (no public URL needed)

2. **Provider Options** — `src/lib/ai/provider.ts` (`getProviderOptions`)
   - Anthropic's native MCP integration
   - Anthropic servers call the MCP server directly
   - Requires the MCP server to be publicly accessible

Both are active simultaneously and serve different deployment scenarios.

## Prerequisites

- Google Cloud project with OAuth 2.0 credentials
- Gmail, Calendar, and Drive APIs enabled
- A running MCP server (e.g., `@anthropic/mcp-google-workspace`)

## Environment Variables

```bash
# URL of the MCP server's SSE endpoint
MCP_GOOGLE_WORKSPACE_URL=https://your-mcp-server.railway.app/mcp

# Bearer token for authenticating with the MCP server
MCP_AUTH_TOKEN=your-secret-token
```

## Deployment Options

### Railway (Recommended)

1. Fork or deploy the MCP Google Workspace server image
2. Set Google OAuth credentials as env vars on the Railway service
3. Note the public URL (e.g., `https://mcp-google-xxxx.up.railway.app`)
4. Add `MCP_GOOGLE_WORKSPACE_URL` and `MCP_AUTH_TOKEN` to Hugh Assistant's env

### Docker (Self-hosted)

```bash
docker run -d \
  -p 8080:8080 \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  -e GOOGLE_REFRESH_TOKEN=... \
  -e MCP_AUTH_TOKEN=your-secret-token \
  your-mcp-image
```

Then set `MCP_GOOGLE_WORKSPACE_URL=http://localhost:8080/mcp` in `.env.local`.

## Verification

1. Set the env vars and restart Hugh Assistant
2. Check `/api/status` — MCP should show `"connected"`
3. Ask Hugh a question like "What's on my calendar today?" — it should invoke calendar tools

## Resilience

- **Connection timeout:** 10s. If the MCP server is unreachable, chat continues without MCP tools.
- **Client caching:** The MCP client is lazily initialized and cached. On error, it resets and retries on the next request.
- **Health check caching:** `/api/status` caches MCP health for 60s to stay fast.
- **No MCP = no error:** The app works fully without MCP configured.

## Status: Code Complete, Awaiting Infrastructure

The code is ready. MCP server deployment and Google credential provisioning is a separate infrastructure task.
