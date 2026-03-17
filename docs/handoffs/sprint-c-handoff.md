# Sprint C Handoff — MCP Wiring (Task 3.16)

## Audit Findings

- Dual MCP approaches existed (SDK SSE client + Anthropic provider options) — both are valid for different deployment scenarios. Kept both.
- MCP SDK client had no connection timeout — could hang indefinitely if server unreachable.
- MCP client was not reset on error — a failed connection would never retry.
- `/api/status` reported MCP as "connected" if env var was set, regardless of actual connectivity.
- No deployment documentation existed.

## Changes Made

### MCP Client Resilience — `src/lib/ai/mcp-tools.ts`

- Added `MCP_TIMEOUT_MS = 10_000` constant
- Wrapped `createMCPClient` in `Promise.race` with timeout — connection fails fast instead of hanging
- Reset `mcpClient = null` on any error — forces fresh connection attempt on next request
- Added `checkMcpHealth()` export — attempts to get tools and returns true/false

### Status Endpoint — `src/app/api/status/route.ts`

- Replaced `isMcpConfigured() ? "connected" : "not_configured"` with actual health check
- Three states: `not_configured` (no URL), `connected` (health check passes), `disconnected` (URL set but check fails)
- Health check result cached for 60s to keep `/api/status` fast (avoids 10s timeout on every status poll)

### Documentation

- **`.env.example`** — Updated MCP section with clearer comments explaining both approaches and pointing to deployment guide
- **`docs/MCP_DEPLOYMENT.md`** — New file covering architecture, prerequisites, Railway/Docker deployment, env vars, verification steps, and resilience behavior

## Decisions

- **Keep both MCP approaches:** SDK client works with private servers (proxied through Next.js). Provider options work when MCP server has a public URL (Anthropic calls it directly). Both use the same env vars.
- **60s health cache:** Prevents `/api/status` from being slow (up to 10s MCP timeout) on every request. Trade-off: status may be stale by up to 60s.
- **"Code Complete, Awaiting Infrastructure":** MCP server deployment and Google credential setup is an infrastructure task outside the app codebase.

## Test Results

- `npm run typecheck` — passes clean

## Manual Testing Checklist

- [ ] App starts without MCP env vars — no errors, MCP shows "not_configured"
- [ ] `/api/status` returns within <1s when MCP is not configured
- [ ] With invalid MCP URL, status shows "disconnected" (after first check)
- [ ] Chat works normally regardless of MCP state
- [ ] Status endpoint caches MCP health (second call within 60s is fast)

## Status

Code complete. MCP server deployment (Docker/Railway) and Google OAuth credential provisioning are separate infrastructure tasks to be completed by the team.
