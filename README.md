# Hugh Assistant

A single-user AI assistant web app for Hugh, co-founder of Revolin Sports. Sign in with Google, chat with Claude (with web search), and optionally connect Google Workspace tools via MCP.

## What It Does

- **Chat with Claude Sonnet 4.6** with streaming responses
- **Web search** built in (Claude's native web search tool)
- **Google Workspace** access via MCP (Drive, Gmail, Calendar, Sheets, Docs, Slides) — optional
- **Conversation persistence** with PostgreSQL (sliding window + automatic summarization)
- **Single-user auth** via Google OAuth with email allowlist
- **Production-ready** Docker deployment with Caddy reverse proxy

## Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or use Docker Compose)
- Google Cloud project with OAuth 2.0 credentials
- Anthropic API key

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your real values (see below)

# 3. Set up database
# Option A: Local PostgreSQL
psql $DATABASE_URL -f src/lib/db/schema.sql

# Option B: Skip — the app works without a database (no persistence)

# 4. Start dev server
npm run dev
# Open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | Yes | NextAuth encryption secret. Generate: `openssl rand -base64 48` |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth client secret |
| `ALLOWED_EMAIL` | Yes | Email address allowed to sign in |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (starts with `sk-ant-`) |
| `DATABASE_URL` | No* | PostgreSQL connection string |
| `MCP_GOOGLE_WORKSPACE_URL` | No | MCP server URL for Google Workspace tools |
| `MCP_AUTH_TOKEN` | No | Bearer token for MCP server authentication |

*The app works without `DATABASE_URL` — conversations won't persist across page reloads, but chat functions normally.

## Database Migration

```bash
# Using the migration script
DATABASE_URL=postgresql://user:pass@localhost:5432/hugh_assistant npm run migrate

# Or directly with psql
psql $DATABASE_URL -f src/lib/db/schema.sql
```

The schema creates three tables: `conversations`, `messages` (append-only), and `summaries`.

## Docker Setup

```bash
# 1. Configure environment
cp .env.example .env.local
# Fill in AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ALLOWED_EMAIL, ANTHROPIC_API_KEY

# 2. Build and start all services
docker compose up --build -d

# 3. Check status
curl http://localhost:3000/api/status
```

Docker Compose starts 4 services:
- **app** — Next.js on port 3000
- **postgres** — PostgreSQL 16 (auto-runs schema migration on first start)
- **mcp-backend** — Google Workspace MCP server (internal only)
- **caddy** — Reverse proxy with automatic HTTPS (ports 80/443)

Edit the `Caddyfile` to replace `YOUR_DOMAIN` with your actual domain before deploying.

## What Works Without Secrets

| Missing Variable | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` | UI loads, chat shows config error, no crash |
| `AUTH_GOOGLE_ID/SECRET` | Sign-in button visible but auth will fail with clear error |
| `DATABASE_URL` | Chat works normally — no conversation persistence or summarization |
| `MCP_GOOGLE_WORKSPACE_URL` | Chat works, no Google Workspace tools, `/api/status` shows `not_configured` |

## Adding Secrets

### 1. Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Create an API key
3. Set `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`

### 2. Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application type)
3. Add redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google` (or `http://localhost:3000/api/auth/callback/google` for local dev)
4. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local`

### 3. MCP Google Workspace (Optional)
1. Set up the [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google-workspace-mcp) server
2. Configure Google API scopes for Drive, Gmail, Calendar, etc.
3. Set `MCP_GOOGLE_WORKSPACE_URL` and `MCP_AUTH_TOKEN` in `.env.local`

## Architecture

```
Browser (Next.js App Router)
  ├── /           → Login (Google OAuth)
  └── /chat       → Chat UI (useChat hook, streaming)
          │
          ▼  POST /api/chat
  Next.js API Route
  ├── Auth check + rate limit
  ├── Save user message to DB (if configured)
  ├── Build context (system blocks + sliding window + summary)
  ├── streamText → Claude API (with web search + MCP tools)
  ├── Save assistant response to DB
  └── Trigger summarization (if messages > 40)
          │
     ┌────┴────┐
     ▼         ▼
  Claude    MCP Server
  (Anthropic)  (Google Workspace)
```

## Key Design Decisions

See [DECISIONS.md](./DECISIONS.md) for the full log of architectural choices.
